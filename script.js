const get = (id) => document.getElementById(id);
const apiUrl = "https://api.github.com/users/";
const searchForm = get("search-form");
const input = get("input");
const searchStatus = get("search-status");
const profile = get("profile");
const repositoriesStatus = get("repositories-status");
const repositoryList = get("repository-list");
const copyStatus = get("copy-status");
const themeButton = get("btn-mode");
const root = document.documentElement.style;
let currentRequest;
let currentProfileUrl = "";

function setTheme(dark) {
  root.setProperty("--lm-bg", dark ? "#141D2F" : "#F6F8FF");
  root.setProperty("--lm-bg-content", dark ? "#1E2A47" : "#FEFEFE");
  root.setProperty("--lm-text", dark ? "white" : "#4B6A9B");
  root.setProperty("--lm-text-alt", dark ? "white" : "#2B3442");
  root.setProperty("--link-color", dark ? "#8dc4ff" : "#005fcc");
  root.setProperty("--lm-icon-bg", dark ? "brightness(1000%)" : "brightness(100%)");
  get("mode-text").textContent = dark ? "LIGHT" : "DARK";
  get("mode-icon").src = dark ? "./assets/images/sun-icon.svg" : "./assets/images/moon-icon.svg";
  themeButton.setAttribute("aria-pressed", String(dark));
  localStorage.setItem("dark-mode", String(dark));
}

themeButton.addEventListener("click", () => {
  setTheme(themeButton.getAttribute("aria-pressed") !== "true");
});

function apiError(response) {
  if (response.status === 404) return "No GitHub user found with that username.";
  if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    return "GitHub's API rate limit was reached. Please try again later.";
  }
  return `GitHub returned an error (${response.status}). Please try again.`;
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(apiError(response));
  return response.json();
}

function setDetail(id, value) {
  const element = get(id);
  const available = Boolean(value);
  element.textContent = value || "Not Available";
  element.style.opacity = available ? "1" : "0.5";
  element.previousElementSibling.style.opacity = available ? "1" : "0.5";
}

function websiteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function updateProfile(data) {
  currentProfileUrl = `https://github.com/${encodeURIComponent(data.login)}`;
  get("avatar").src = data.avatar_url;
  get("avatar").alt = `${data.login}'s avatar`;
  get("name").textContent = data.name || data.login;
  get("user").textContent = `@${data.login}`;
  get("user").href = currentProfileUrl;
  const joined = new Date(data.created_at);
  get("date").textContent = `Joined ${joined.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  })}`;
  get("bio").textContent = data.bio || "This profile has no bio";
  get("repos").textContent = data.public_repos;
  get("followers").textContent = data.followers;
  get("following").textContent = data.following;
  setDetail("location", data.location);
  const website = websiteUrl(data.blog);
  setDetail("page", data.blog);
  if (website) get("page").href = website;
  else get("page").removeAttribute("href");
  setDetail("twitter", data.twitter_username);
  if (data.twitter_username) get("twitter").href = `https://twitter.com/${encodeURIComponent(data.twitter_username)}`;
  else get("twitter").removeAttribute("href");
  setDetail("company", data.company);
  copyStatus.textContent = "";
  profile.hidden = false;
}

function renderRepositories(repositories, login) {
  repositoryList.replaceChildren();
  if (repositories.length === 0) {
    repositoriesStatus.textContent = "No public repositories found.";
    return;
  }
  repositoriesStatus.textContent = "";
  repositories.forEach((repository) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `https://github.com/${encodeURIComponent(login)}/${encodeURIComponent(repository.name)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = repository.name;
    item.append(link);
    if (repository.description) {
      const description = document.createElement("p");
      description.textContent = repository.description;
      item.append(description);
    }
    const details = document.createElement("span");
    details.className = "repository-details";
    details.textContent = [repository.language, `${repository.stargazers_count} stars`].filter(Boolean).join(" · ");
    item.append(details);
    repositoryList.append(item);
  });
}

async function search(username) {
  if (currentRequest) {
    currentRequest.abort();
    if (repositoriesStatus.textContent === "Loading repositories...") {
      repositoriesStatus.textContent = "Repository loading was interrupted. Search again to retry.";
    }
  }
  const controller = new AbortController();
  currentRequest = controller;
  const name = username.trim();
  if (!/^(?=.{1,39}$)[a-z\d]+(?:-[a-z\d]+)*$/i.test(name)) {
    searchForm.removeAttribute("aria-busy");
    searchStatus.textContent = "Enter a valid GitHub username.";
    return;
  }

  searchForm.setAttribute("aria-busy", "true");
  searchStatus.textContent = "Searching GitHub...";
  try {
    const data = await fetchJson(`${apiUrl}${encodeURIComponent(name)}`, controller.signal);
    if (controller.signal.aborted) return;
    updateProfile(data);
    searchStatus.textContent = `Showing profile for @${data.login}.`;
    repositoryList.replaceChildren();
    repositoriesStatus.textContent = "Loading repositories...";
    try {
      const repositories = await fetchJson(
        `${apiUrl}${encodeURIComponent(data.login)}/repos?sort=updated&per_page=5`,
        controller.signal
      );
      if (!controller.signal.aborted) renderRepositories(repositories, data.login);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Unable to load repositories:", error);
      repositoriesStatus.textContent = `Unable to load repositories. ${error.message}`;
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error("Unable to load profile:", error);
    searchStatus.textContent = error instanceof TypeError
      ? "Unable to reach GitHub. Check your connection and try again."
      : error.message;
  } finally {
    if (currentRequest === controller) searchForm.removeAttribute("aria-busy");
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});

get("copy-profile").addEventListener("click", async () => {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser.");
    await navigator.clipboard.writeText(currentProfileUrl);
    copyStatus.textContent = "Profile link copied.";
  } catch (error) {
    console.error("Unable to copy profile link:", error);
    copyStatus.textContent = "Unable to copy. You can copy the profile link above.";
  }
});

setTheme(localStorage.getItem("dark-mode") === "true");
search("Crusader201");
