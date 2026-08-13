const PLACEHOLDER_RE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

const TEMPLATE_FIELDS = ["title", "project", "model", "turns", "lastPrompt", "gitBranch"];

function isMissing(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value === "") return true;
  return false;
}

function altOrCollapse(field) {
  const alt = field.alt ?? "";
  return alt === "" ? "" : alt;
}

function truncateLastPrompt(value, maxLen) {
  if (typeof value !== "string") return value;
  if (typeof maxLen !== "number") return value;
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
}

function resolveField(fieldKey, config, state) {
  const field = config.fields[fieldKey];
  const value = state[fieldKey];

  if (field.show === false) {
    return altOrCollapse(field);
  }

  if (fieldKey === "title") {
    if (isMissing(value)) {
      if (!isMissing(state.project)) return state.project;
      return altOrCollapse(field);
    }
    return value;
  }

  if (fieldKey === "turns") {
    if (value === null || value === undefined) {
      return altOrCollapse(field);
    }
    return value;
  }

  if (fieldKey === "lastPrompt") {
    const truncated = truncateLastPrompt(value, field.maxLen);
    if (isMissing(truncated)) {
      return altOrCollapse(field);
    }
    return truncated;
  }

  if (isMissing(value)) {
    return altOrCollapse(field);
  }

  return value;
}

function tokenize(template) {
  const tokens = [];
  let lastIndex = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_RE.exec(template)) !== null) {
    tokens.push({
      literalBefore: template.slice(lastIndex, match.index),
      name: match[1]
    });
    lastIndex = match.index + match[0].length;
  }
  return { tokens, trailing: template.slice(lastIndex) };
}

function renderTemplate(template, values) {
  const { tokens, trailing } = tokenize(template);
  if (tokens.length === 0) return template;

  const leadingLiteral = tokens[0].literalBefore;
  const seps = tokens.slice(1).map((t) => t.literalBefore);

  let out = "";
  let lastKept = false;
  let anyPrevKept = false;
  let pendingSep = "";

  for (let i = 0; i < tokens.length; i++) {
    const value = values[tokens[i].name] ?? "";
    if (value === "") {
      lastKept = false;
      pendingSep = seps[i] ?? "";
      continue;
    }
    if (lastKept) {
      out += tokens[i].literalBefore + value;
    } else if (anyPrevKept) {
      out += pendingSep + value;
    } else {
      out += leadingLiteral + value;
    }
    pendingSep = "";
    lastKept = true;
    anyPrevKept = true;
  }

  if (lastKept) out += trailing;
  return out;
}

export function parseIdleAfter(value) {
  if (typeof value !== "string") return 0;
  const match = /^(\d+)([smh])$/.exec(value);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  return 0;
}

export function buildActivity(config, state, options = {}) {
  const values = {};
  for (const fieldKey of TEMPLATE_FIELDS) {
    values[fieldKey] = resolveField(fieldKey, config, state);
  }

  const payload = {
    details: renderTemplate(config.display.details, values),
    state: renderTemplate(config.display.state, values)
  };

  if (Number.isInteger(state.startedAt) && state.startedAt > 0) {
    payload.timestamps = { start: state.startedAt };
  }

  const assets = {};
  if (config.discord.largeImage) assets.large_image = config.discord.largeImage;
  if (config.discord.smallImage) assets.small_image = config.discord.smallImage;
  if (Object.keys(assets).length > 0) payload.assets = assets;

  return payload;
}
