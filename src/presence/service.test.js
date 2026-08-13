import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../config/service.js";
import { buildActivity } from "./service.js";

function makeConfig(overrides = {}) {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.discord = { appId: "", largeImage: "", smallImage: "" };
  config.fields.title = { show: true, alt: "Working on something" };
  config.fields.project = { show: true, alt: "a project" };
  config.fields.model = { show: true, alt: "Claude Code" };
  config.fields.elapsed = { show: true, alt: "" };
  config.fields.turns = { show: true, alt: "0" };
  config.fields.lastPrompt = { show: true, alt: "thinking...", maxLen: 60 };
  config.fields.gitBranch = { show: true, alt: "" };
  config.display.details = "{title}";
  config.display.state = "{model} · {turns} · {lastPrompt}";
  for (const [key, value] of Object.entries(overrides)) {
    config[key] = value;
  }
  return config;
}

test("buildActivity renders details and state templates with placeholders", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X"
  });
});

test("buildActivity uses alt when show is false", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: false, alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "Claude Code · 3 · Help me with X"
  });
});

test("buildActivity uses alt when data is missing", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: null,
    startedAt: null,
    turns: null,
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "Claude Code · 0 · thinking..."
  });
});

test("buildActivity collapses empty alt and drops adjacent separator", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: null,
    lastPrompt: "Help me with X",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · Help me with X"
  });
});

test("buildActivity keeps separator between non-adjacent live fields", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: null,
    lastPrompt: "Help me with X",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · Help me with X"
  });
});

test("title falls back to project name when transcript title is null", () => {
  const config = makeConfig();
  const state = {
    title: null,
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 0,
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "/home/user/some-project",
    state: "opus · 0 · thinking..."
  });
});

test("lastPrompt truncates at maxLen when shown", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 10 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with something long",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me wi"
  });
});

test("lastPrompt unchanged when length is within maxLen", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X"
  });
});

test("elapsed sets timestamps.start when startedAt is a positive integer", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: 1691846400,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X",
    timestamps: { start: 1691846400 }
  });
});

test("elapsed omits timestamps when startedAt is null", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X"
  });
});

test("discord.largeImage maps to assets.large_image", () => {
  const config = makeConfig({
    discord: { appId: "1234", largeImage: "claude_logo", smallImage: "" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X",
    assets: { large_image: "claude_logo" }
  });
});

test("discord.smallImage empty omits assets.small_image", () => {
  const config = makeConfig({
    discord: { appId: "1234", largeImage: "claude_logo", smallImage: "" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.assets.small_image, undefined);
});

test("discord.smallImage set maps to assets.small_image", () => {
  const config = makeConfig({
    discord: { appId: "1234", largeImage: "claude_logo", smallImage: "branch_icon" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X",
    assets: { large_image: "claude_logo", small_image: "branch_icon" }
  });
});

test("buildActivity renders template with no placeholders as literal text", () => {
  const config = makeConfig({
    display: { details: "Fixed message", state: "Another fixed message", idle: "Idle", offline: "", idleAfter: "5m" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Fixed message",
    state: "Another fixed message"
  });
});

test("buildActivity treats unknown placeholder as collapsing", () => {
  const config = makeConfig({
    display: { details: "{title} ({unknown})", state: "{model}", idle: "Idle", offline: "", idleAfter: "5m" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus"
  });
});

test("buildActivity omits timestamps when startedAt is zero", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: 0,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.timestamps, undefined);
});

test("buildActivity omits timestamps when startedAt is negative", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: -1,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.timestamps, undefined);
});

test("buildActivity omits timestamps when startedAt is a float", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: 1691846400.5,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.timestamps, undefined);
});

test("buildActivity omits assets when both images are empty", () => {
  const config = makeConfig({
    discord: { appId: "1234", largeImage: "", smallImage: "" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.assets, undefined);
});

test("buildActivity renders empty string when all fields collapse", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "" },
      project:    { show: true,  alt: "" },
      model:      { show: true,  alt: "" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "" },
      lastPrompt: { show: true,  alt: "", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: null,
    project: null,
    model: null,
    startedAt: null,
    turns: null,
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: ""
  });
});

test("buildActivity uses title alt when show is false, ignoring project", () => {
  const config = makeConfig({
    fields: {
      title:      { show: false, alt: "Hidden title" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: null,
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Hidden title",
    state: "opus · 3 · Help me with X"
  });
});

test("buildActivity falls back to title alt when title and project are both missing", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Untitled" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: null,
    project: null,
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Untitled",
    state: "opus · 3 · Help me with X"
  });
});

test("buildActivity truncates lastPrompt to empty when maxLen is zero, collapsing via alt", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "", maxLen: 0 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3"
  });
});

test("buildActivity does not truncate lastPrompt when show is false", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: false, alt: "thinking...", maxLen: 3 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · thinking..."
  });
});

test("buildActivity renders project and gitBranch placeholders", () => {
  const config = makeConfig({
    display: { details: "{project}", state: "on {gitBranch}", idle: "Idle", offline: "", idleAfter: "5m" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "/home/user/some-project",
    state: "on feat/foo"
  });
});

test("buildActivity preserves leading literal text before a single placeholder", () => {
  const config = makeConfig({
    display: { details: "Working on {title}", state: "in {model}", idle: "Idle", offline: "", idleAfter: "5m" }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Working on Adding Discord presence",
    state: "in opus"
  });
});

test("buildActivity drops leading literal text when the first placeholder collapses", () => {
  const config = makeConfig({
    display: { details: "Working on {title}", state: "in {model}", idle: "Idle", offline: "", idleAfter: "5m" },
    fields: {
      title:      { show: true,  alt: "" },
      project:    { show: true,  alt: "" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: null,
    project: null,
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "in opus"
  });
});

test("buildActivity treats 0 turns as a meaningful value, not missing", () => {
  const config = makeConfig();
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 0,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 0 · Help me with X"
  });
});

test("buildActivity treats empty-string lastPrompt as missing", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "",
    gitBranch: "feat/foo"
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · thinking..."
  });
});
