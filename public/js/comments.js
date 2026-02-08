// ===========================
// ELEMENTS
// ===========================
const form = document.getElementById("commentForm");
const titleInput = document.getElementById("title");
const bodyInput = document.getElementById("body");
const commentsContainer = document.getElementById("comments");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");

// Modal
const modal = document.getElementById("authModal");
const modalTitle = document.getElementById("authModalTitle");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authSwitchBtn = document.getElementById("authSwitchBtn");
const authError = document.getElementById("authError");
const authCloseBtn = document.getElementById("authCloseBtn");

let isAuthenticated = false;
let authMode = "login";
let currentUser = null;


// ===========================
// AUTH STATUS CHECK
// ===========================
async function checkAuth() {
  try {
    const res = await fetch("/api/auth/status");

    if (res.status === 401) {
      handleSessionExpired();
      return;
    }

    const data = await res.json();

    isAuthenticated = !!data.authenticated;
    currentUser = data.user?.username || null;

    if (isAuthenticated) {
      authStatus.textContent = `Signed in as ${currentUser}`;
      loginBtn.hidden = true;
      logoutBtn.hidden = false;
    } else {
      authStatus.textContent = "Sign in to post comments";
      loginBtn.hidden = false;
      logoutBtn.hidden = true;
    }

    updateCommentFormState();
    await loadComments();
  } catch (err) {
    console.error("Auth check failed", err);
  }
}


function updateCommentFormState() {
  const disabled = !isAuthenticated;
  titleInput.disabled = disabled;
  bodyInput.disabled = disabled;
}

// ===========================
// MODAL LOGIC
// ===========================
function openAuthModal(mode = "login") {
  authMode = mode;
  modal.classList.remove("hidden");
  authError.textContent = "";

  modalTitle.textContent = mode === "login" ? "Sign In" : "Create Account";
  authSwitchBtn.textContent = mode === "login"
    ? "Need an account? Sign up"
    : "Already have an account? Sign in";
}

function closeAuthModal() {
  modal.classList.add("hidden");
  authUsername.value = "";
  authPassword.value = "";
}

loginBtn.onclick = () => openAuthModal("login");
authCloseBtn.onclick = closeAuthModal;

authSwitchBtn.onclick = () => {
  openAuthModal(authMode === "login" ? "register" : "login");
};

authSubmitBtn.onclick = async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value;

  if (!username || !password) {
    authError.textContent = "Missing username or password";
    return;
  }

  const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!res.ok) {
    authError.textContent = data.error || "Auth failed";
    return;
  }

  authError.style.color = "#22c55e";
  authError.textContent = authMode === "login" ? "Signed in 🎶" : "Account created 🎉";

  setTimeout(async () => {
    closeAuthModal();
    await checkAuth();
  }, 700);
};

// ===========================
// LOGOUT
// ===========================
logoutBtn.onclick = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  await checkAuth();
};

// ===========================
// COMMENT GUARD
// ===========================
[titleInput, bodyInput].forEach(el => {
  el.addEventListener("focus", () => {
    if (!isAuthenticated) {
      openAuthModal("login");
      el.blur();
    }
  });
});

// ===========================
// LOAD COMMENTS
// ===========================
async function loadComments() {
  commentsContainer.textContent = "Loading comments...";

  try {
    const res = await fetch("/api/comments");
    const comments = await res.json();

    commentsContainer.innerHTML = "";

    if (!comments.length) {
      commentsContainer.textContent = "No comments yet.";
      return;
    }

    comments.forEach(renderComment);
  } catch {
    commentsContainer.textContent = "Failed to load comments.";
  }
}

function renderComment(comment) {
  const div = document.createElement("div");
  div.className = "comment";

  div.innerHTML = `
    <h4>${comment.title}</h4>
    <small>${comment.username} • ${new Date(comment.created_at).toLocaleDateString()}</small>
    <p>${comment.body}</p>
  `;

  // Only show delete for YOUR comments
  if (isAuthenticated && comment.username === currentUser) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "comment-delete";

    delBtn.onclick = async () => {
      if (!confirm("Delete your comment?")) return;
      await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      loadComments();
    };

    div.appendChild(delBtn);
  }

  commentsContainer.appendChild(div);
}


// ===========================
// POST COMMENT
// ===========================
form.addEventListener("submit", async e => {
  e.preventDefault();

  if (!isAuthenticated) {
    openAuthModal("login");
    return;
  }

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();
  if (!title || !body) return;

  const res = await fetch("/api/comments", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title, body })
    });

    if (res.status === 401) {
        handleSessionExpired();
        return;
    }


  if (res.ok) {
    titleInput.value = "";
    bodyInput.value = "";
    loadComments();
  }
});


function handleSessionExpired(message = "Your session expired. Please sign in again.") {
  isAuthenticated = false;
  currentUser = null;

  authStatus.textContent = message;
  loginBtn.hidden = false;
  logoutBtn.hidden = true;

  updateCommentFormState();
  openAuthModal("login");
}

// ===========================
// INIT
// ===========================
checkAuth();

