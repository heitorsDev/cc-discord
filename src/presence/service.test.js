import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../config/service.js";
import { buildActivity } from "./service.js";

function makeConfig(overrides = {}) {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
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
    title: null,
    project: "/home/user/some-project",
    model: null,
    startedAt: null,
    turns: null,
    lastPrompt: null,
    gitBranch: null
  };

  const payload = buildActivity(config, state);

  assert.deepEqual(payload, {
    details: "Working on something",
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
