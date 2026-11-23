const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");

function createSite(fetch) {
  const elements = new Map();
  function element() {
    const attributes = {};
    return {
      style: { setProperty() {} },
      previousElementSibling: { style: {} },
      children: [],
      textContent: "",
      hidden: false,
      setAttribute(name, value) { attributes[name] = value; },
      getAttribute(name) { return attributes[name]; },
      removeAttribute(name) { delete attributes[name]; },
      addEventListener() {},
      replaceChildren() { this.children = []; },
      append(child) { this.children.push(child); },
    };
  }
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      documentElement: { style: { setProperty() {} } },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: {},
    console: { error() {} },
    AbortController, URL, fetch,
  });
  vm.runInContext(source, context);
  return { context, elements };
}

function user(login) {
  return {
    login, name: login, avatar_url: "", created_at: "2022-01-07T00:00:00Z",
    public_repos: 1, followers: 0, following: 0, bio: null,
    location: null, blog: null, twitter_username: null, company: null,
  };
}

function response(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[name] || null; } },
    async json() { return data; },
  };
}

test("search renders recent repositories and reports empty and failed results", async () => {
  const fetch = async (url) => {
    const name = new URL(url).pathname.split("/")[2];
    if (name === "missing") return response({}, 404);
    if (name === "limited") return response({}, 403, { "x-ratelimit-remaining": "0" });
    if (url.includes("/repos?")) {
      if (name === "broken") return response({}, 500);
      return response(name === "empty" ? [] : [{ name: "example", description: "Test", stargazers_count: 2 }]);
    }
    return response(user(name));
  };
  const { context, elements } = createSite(fetch);
  await context.search("example");
  assert.equal(elements.get("user").textContent, "@example");
  assert.equal(elements.get("repository-list").children[0].children[0].href, "https://github.com/example/example");

  await context.search("empty");
  assert.equal(elements.get("repository-list").children.length, 0);
  assert.equal(elements.get("repositories-status").textContent, "No public repositories found.");
  await context.search("broken");
  assert.match(elements.get("repositories-status").textContent, /Unable to load repositories.*500/);
  assert.equal(elements.get("user").textContent, "@broken");
  await context.search("missing");
  assert.match(elements.get("search-status").textContent, /No GitHub user found/);
  await context.search("limited");
  assert.match(elements.get("search-status").textContent, /rate limit/);
});

test("a slower search cannot overwrite a newer profile", async () => {
  let releaseSlow;
  const slow = new Promise((resolve) => { releaseSlow = resolve; });
  const fetch = async (url) => {
    const name = new URL(url).pathname.split("/")[2];
    if (name === "slow") await slow;
    return response(url.includes("/repos?") ? [] : user(name));
  };
  const { context, elements } = createSite(fetch);
  const firstSearch = context.search("slow");
  await context.search("fast");
  releaseSlow();
  await firstSearch;
  assert.equal(elements.get("user").textContent, "@fast");
  assert.match(elements.get("search-status").textContent, /@fast/);
});
