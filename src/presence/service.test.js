import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../config/service.js";
import { buildActivity, parseIdleAfter } from "./service.js";

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

function makeFailClosedConfig() {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.discord = { appId: "", largeImage: "", smallImage: "" };
  config.display.details = "{title}";
  config.display.state = "{model} · {turns} · {lastPrompt}";
  config.display.idle = "Idle";
  config.display.offline = "";
  config.display.idleAfter = "5m";
  for (const [fieldKey, altValue] of Object.entries(config.privacy.alt)) {
    if (config.fields[fieldKey]) {
      config.fields[fieldKey] = { ...config.fields[fieldKey], show: false, alt: altValue };
    }
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

test("buildActivity collapses turns when show is false and alt is empty", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: false, alt: "" },
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
    state: "opus · Help me with X"
  });
});

test("buildActivity collapses multiple adjacent fields in a single template", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: true,  alt: "" }
    }
  });
  const state = {
    title: "Adding Discord presence",
    project: "/home/user/some-project",
    model: null,
    startedAt: null,
    turns: null,
    lastPrompt: "Help me with X",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "Help me with X"
  });
});

test("buildActivity uses turns alt when show is false even with data present", () => {
  const config = makeConfig({
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: false, alt: "many" },
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
    state: "opus · many · Help me with X"
  });
});

test("buildActivity uses gitBranch alt when show is false even with data present", () => {
  const config = makeConfig({
    display: { details: "{title}", state: "on {gitBranch}", idle: "Idle", offline: "", idleAfter: "5m" },
    fields: {
      title:      { show: true,  alt: "Working on something" },
      project:    { show: true,  alt: "a project" },
      model:      { show: true,  alt: "Claude Code" },
      elapsed:    { show: true,  alt: "" },
      turns:      { show: true,  alt: "0" },
      lastPrompt: { show: true,  alt: "thinking...", maxLen: 60 },
      gitBranch:  { show: false, alt: "a branch" }
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
    state: "on a branch"
  });
});

test("buildActivity produces a complete payload with templates, elapsed, and assets", () => {
  const config = makeConfig({
    discord: { appId: "1234", largeImage: "claude_logo", smallImage: "branch_icon" }
  });
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
    timestamps: { start: 1691846400 },
    assets: { large_image: "claude_logo", small_image: "branch_icon" }
  });
});

test("renderTemplate: leading placeholder collapses and second is live", () => {
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

  const collapsed = buildActivity(config, state);

  const payload = buildActivity({
    ...config,
    fields: {
      ...config.fields,
      model: { show: true, alt: "A" }
    }
  }, state);

  assert.equal(payload.details, "");
  assert.equal(payload.state, "A");
  assert.equal(collapsed.state, "");
});

test("buildActivity: leading placeholder collapses with second live, no orphaned separator", () => {
  const config = makeConfig({
    display: { details: "{model} · {lastPrompt}", state: "{model} · {lastPrompt}", idle: "Idle", offline: "", idleAfter: "5m" },
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
    lastPrompt: "Help me with X",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Help me with X",
    state: "Help me with X"
  });
});

test("buildActivity: collapsed first, live middle, collapsed last yields only middle", () => {
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
    turns: "y",
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "y"
  });
});

test("buildActivity: collapsed first, collapsed middle, live last yields only last", () => {
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
    lastPrompt: "z",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "z"
  });
});

test("buildActivity: live first, collapsed middle, live last keeps separator around collapse", () => {
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
    model: "A",
    startedAt: null,
    turns: null,
    lastPrompt: "C",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "A · C"
  });
});

test("buildActivity: live first, collapsed middle, collapsed last yields only first", () => {
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
    model: "A",
    startedAt: null,
    turns: null,
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "A"
  });
});

test("buildActivity: collapsed first, live middle, collapsed last yields only middle", () => {
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
    turns: "B",
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "B"
  });
});

test("buildActivity: collapsed first, live middle, live last yields middle and last joined", () => {
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
    turns: "B",
    lastPrompt: "C",
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "B · C"
  });
});

test("buildActivity: live first, live middle, collapsed last drops trailing separator", () => {
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
    model: "A",
    startedAt: null,
    turns: "B",
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "",
    state: "A · B"
  });
});

test("buildActivity: all placeholders collapse with non-empty separator template renders empty string", () => {
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

test("parseIdleAfter parses minute suffix", () => {
  assert.equal(parseIdleAfter("5m"), 300000);
});

test("parseIdleAfter parses second suffix", () => {
  assert.equal(parseIdleAfter("30s"), 30000);
});

test("parseIdleAfter parses hour suffix", () => {
  assert.equal(parseIdleAfter("1h"), 3600000);
});

test("parseIdleAfter treats zero as disabled", () => {
  assert.equal(parseIdleAfter("0"), 0);
});

test("parseIdleAfter treats empty string as disabled", () => {
  assert.equal(parseIdleAfter(""), 0);
});

test("parseIdleAfter returns 0 for garbage input", () => {
  assert.equal(parseIdleAfter("garbage"), 0);
  assert.equal(parseIdleAfter("5x"), 0);
  assert.equal(parseIdleAfter("abc"), 0);
});

test("buildActivity publishes real values when privacy.allowlist is [*]", () => {
  const config = makeConfig();
  config.privacy = {
    mode: "allowlist",
    allowlist: ["*"],
    denylist: [],
    alt: { title: "Coding", project: "a project", lastPrompt: "" }
  };
  const state = {
    title: "Adding Discord presence",
    project: "/home/u/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me with X",
    gitBranch: "feat/foo",
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Adding Discord presence",
    state: "opus · 3 · Help me with X"
  });
});

test("buildActivity substitutes privacy.alt when project is blocked by allowlist", () => {
  const config = makeConfig();
  config.privacy = {
    mode: "allowlist",
    allowlist: ["allowed-project"],
    denylist: [],
    alt: { title: "Coding", project: "a project", lastPrompt: "" }
  };
  config.fields.title = { show: true, alt: "Working on something" };
  config.fields.project = { show: true, alt: "a project" };
  const state = {
    title: "Should not leak",
    project: "/home/u/blocked-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Should not leak",
    gitBranch: "feat/foo",
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.details.includes("Should not leak"), false);
  assert.equal(payload.details.includes("blocked-project"), false);
  assert.equal(payload.state.includes("Should not leak"), false);
  assert.equal(payload.state.includes("blocked-project"), false);
  assert.equal(payload.state.includes("opus"), false);
});

test("buildActivity substitutes privacy.alt when project is matched by denylist", () => {
  const config = makeConfig();
  config.privacy = {
    mode: "denylist",
    allowlist: [],
    denylist: ["client-work"],
    alt: { title: "Coding", project: "a project", lastPrompt: "" }
  };
  config.fields.title = { show: true, alt: "Working on something" };
  config.fields.project = { show: true, alt: "a project" };
  const state = {
    title: "Should not leak",
    project: "/home/u/client-work/secret",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Should not leak",
    gitBranch: "feat/foo",
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.details.includes("Should not leak"), false);
  assert.equal(payload.details.includes("client-work"), false);
  assert.equal(payload.details.includes("secret"), false);
  assert.equal(payload.state.includes("opus"), false);
});

test("buildActivity privacy override wins even when field show is true", () => {
  const config = makeConfig();
  config.privacy = {
    mode: "allowlist",
    allowlist: ["allowed-project"],
    denylist: [],
    alt: { title: "Privacy Title", project: "Privacy Project", lastPrompt: "Privacy Prompt" }
  };
  config.fields.title = { show: true, alt: "Field Alt Title" };
  config.fields.project = { show: true, alt: "Field Alt Project" };
  config.fields.lastPrompt = { show: true, alt: "Field Alt Prompt", maxLen: 60 };
  const state = {
    title: "Real Title",
    project: "/home/u/blocked-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Real Prompt",
    gitBranch: "feat/foo",
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.details.includes("Privacy Title"), true);
  assert.equal(payload.details.includes("Field Alt Title"), false);
  assert.equal(payload.details.includes("Real Title"), false);
  assert.equal(payload.details.includes("Privacy Project"), false);
  assert.equal(payload.details.includes("Field Alt Project"), false);
  assert.equal(payload.details.includes("Privacy Prompt"), false);
  assert.equal(payload.details.includes("Field Alt Prompt"), false);
  assert.equal(payload.details.includes("Real Prompt"), false);
});

test("buildActivity title falls back to privacy.alt.title when project is blocked and title is missing", () => {
  const config = makeConfig();
  config.privacy = {
    mode: "allowlist",
    allowlist: ["allowed-project"],
    denylist: [],
    alt: { title: "Coding", project: "a project", lastPrompt: "" }
  };
  config.display = { details: "{title}", state: "{title}", idle: "Idle", offline: "", idleAfter: "5m" };
  const state = {
    title: null,
    project: "/home/u/blocked-project",
    model: null,
    startedAt: null,
    turns: null,
    lastPrompt: null,
    gitBranch: null,
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.details, "Coding");
  assert.equal(payload.state, "Coding");
  assert.equal(payload.details.includes("blocked-project"), false);
  assert.equal(payload.state.includes("blocked-project"), false);
});

test("buildActivity returns generic text on a fail-closed config from loadConfig", () => {
  const config = makeFailClosedConfig();
  const state = {
    title: "Real session title",
    project: "/home/u/client-work/secret-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Real prompt body",
    gitBranch: "feat/secret",
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state);

  assert.equal(payload.details.includes("Real session title"), false);
  assert.equal(payload.details.includes("client-work"), false);
  assert.equal(payload.details.includes("secret-project"), false);
  assert.equal(payload.state.includes("Real session title"), false);
  assert.equal(payload.state.includes("client-work"), false);
  assert.equal(payload.state.includes("secret-project"), false);
  assert.equal(payload.state.includes("Real prompt body"), false);
});

test("buildActivity renders display.idle when lastActivityAt is older than idleAfter", () => {
  const config = makeConfig();
  config.display.idle = "Idle";
  config.display.idleAfter = "5m";
  const now = 1_700_000_000_000;
  const state = {
    title: "Active session",
    project: "/home/u/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me",
    gitBranch: null,
    lastActivityAt: now - (6 * 60 * 1000),
    offline: false
  };

  const payload = buildActivity(config, state, { now });

  assert.deepEqual(payload, {
    details: "Idle",
    state: "Idle"
  });
});

test("buildActivity does not render idle when lastActivityAt is recent", () => {
  const config = makeConfig();
  config.display.idle = "Idle";
  config.display.idleAfter = "5m";
  const now = 1_700_000_000_000;
  const state = {
    title: "Active session",
    project: "/home/u/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me",
    gitBranch: null,
    lastActivityAt: now - (60 * 1000),
    offline: false
  };

  const payload = buildActivity(config, state, { now });

  assert.notEqual(payload.details, "Idle");
  assert.notEqual(payload.state, "Idle");
});

test("buildActivity does not render idle when idleAfter is 0", () => {
  const config = makeConfig();
  config.display.idle = "Idle";
  config.display.idleAfter = "0";
  const now = 1_700_000_000_000;
  const state = {
    title: "Active session",
    project: "/home/u/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me",
    gitBranch: null,
    lastActivityAt: now - (60 * 60 * 1000),
    offline: false
  };

  const payload = buildActivity(config, state, { now });

  assert.notEqual(payload.details, "Idle");
  assert.notEqual(payload.state, "Idle");
});

test("buildActivity does not render idle when lastActivityAt is null", () => {
  const config = makeConfig();
  config.display.idle = "Idle";
  config.display.idleAfter = "5m";
  const state = {
    title: "Active session",
    project: "/home/u/some-project",
    model: "opus",
    startedAt: null,
    turns: 3,
    lastPrompt: "Help me",
    gitBranch: null,
    lastActivityAt: null,
    offline: false
  };

  const payload = buildActivity(config, state, { now: 1_700_000_000_000 });

  assert.notEqual(payload.details, "Idle");
  assert.notEqual(payload.state, "Idle");
});
