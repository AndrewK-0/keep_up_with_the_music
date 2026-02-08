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

    if (!res.ok) {
      console.error("Auth check failed with status:", res.status);
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
    // Assume not authenticated on error
    isAuthenticated = false;
    currentUser = null;
    updateCommentFormState();
  }
}


function updateCommentFormState() {
  const disabled = !isAuthenticated;
  titleInput.disabled = disabled;
  bodyInput.disabled = disabled;
  
  if (disabled) {
    titleInput.placeholder = "Sign in to post comments";
    bodyInput.placeholder = "Sign in to post comments";
  } else {
    titleInput.placeholder = "Comment title";
    bodyInput.placeholder = "Share your thoughts...";
  }
}

// ===========================
// MODAL LOGIC
// ===========================
function openAuthModal(mode = "login") {
  authMode = mode;
  modal.classList.remove("hidden");
  authError.textContent = "";
  authError.style.color = "#ef4444"; // Reset to error color

  modalTitle.textContent = mode === "login" ? "Sign In" : "Create Account";
  authSwitchBtn.textContent = mode === "login"
    ? "Need an account? Sign up"
    : "Already have an account? Sign in";
  
  authSubmitBtn.textContent = mode === "login" ? "Sign In" : "Sign Up";
}

function closeAuthModal() {
  modal.classList.add("hidden");
  authUsername.value = "";
  authPassword.value = "";
  authError.textContent = "";
}

loginBtn.onclick = () => openAuthModal("login");
authCloseBtn.onclick = closeAuthModal;

// Close modal on outside click
modal.onclick = (e) => {
  if (e.target === modal) {
    closeAuthModal();
  }
};

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

  if (username.length < 3) {
    authError.textContent = "Username must be at least 3 characters";
    return;
  }

  if (password.length < 8) {
    authError.textContent = "Password must be at least 8 characters";
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = "Please wait...";

  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      authError.style.color = "#ef4444";
      authError.textContent = data.error || "Authentication failed";
      return;
    }

    authError.style.color = "#22c55e";
    authError.textContent = authMode === "login" ? "Signed in 🎶" : "Account created 🎉";

    setTimeout(async () => {
      closeAuthModal();
      await checkAuth();
    }, 700);
  } catch (err) {
    console.error("Auth error:", err);
    authError.style.color = "#ef4444";
    authError.textContent = "Network error. Please try again.";
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === "login" ? "Sign In" : "Sign Up";
  }
};

// ===========================
// LOGOUT
// ===========================
logoutBtn.onclick = async () => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    await checkAuth();
  } catch (err) {
    console.error("Logout error:", err);
    // Still update UI even if request fails
    isAuthenticated = false;
    currentUser = null;
    updateCommentFormState();
    authStatus.textContent = "Sign in to post comments";
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
  }
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
    
    if (!res.ok) {
      throw new Error(`Failed to load comments: ${res.status}`);
    }
    
    const comments = await res.json();

    commentsContainer.innerHTML = "";

    if (!comments.length) {
      commentsContainer.textContent = "No comments yet. Be the first to share your thoughts!";
      return;
    }

    comments.forEach(renderComment);
  } catch (err) {
    console.error("Load comments error:", err);
    commentsContainer.textContent = "Failed to load comments. Please refresh the page.";
  }
}

function renderComment(comment) {
  const div = document.createElement("div");
  div.className = "comment";

  // Escape HTML to prevent XSS (defense in depth)
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  const safeTitle = escapeHtml(comment.title);
  const safeBody = escapeHtml(comment.body);
  const safeUsername = escapeHtml(comment.username);
  const formattedDate = new Date(comment.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  div.innerHTML = `
    <h4>${safeTitle}</h4>
    <small>${safeUsername} • ${formattedDate}</small>
    <p>${safeBody}</p>
  `;

  // Only show delete for YOUR comments
  if (isAuthenticated && comment.username === currentUser) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "comment-delete";

    delBtn.onclick = async () => {
      if (!confirm("Delete your comment?")) return;
      
      delBtn.disabled = true;
      delBtn.textContent = "Deleting...";
      
      try {
        const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
        
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || "Failed to delete comment");
          return;
        }
        
        await loadComments();
      } catch (err) {
        console.error("Delete error:", err);
        alert("Network error. Please try again.");
        delBtn.disabled = false;
        delBtn.textContent = "Delete";
      }
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
  
  if (!title || !body) {
    alert("Please fill in both title and body");
    return;
  }

  if (title.length > 128) {
    alert("Title must be 128 characters or less");
    return;
  }

  if (body.length > 4000) {
    alert("Comment must be 4000 characters or less");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Posting...";

  try {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body })
    });

    if (res.status === 401) {
      handleSessionExpired();
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to post comment");
      return;
    }

    // Success - clear form and reload
    titleInput.value = "";
    bodyInput.value = "";
    await loadComments();
    
    // Scroll to top to see new comment
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error("Post comment error:", err);
    alert("Network error. Please try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});


function handleSessionExpired(message = "Your session expired. Please sign in again.") {
  isAuthenticated = false;
  currentUser = null;

  authStatus.textContent = message;
  authStatus.style.color = "#ef4444";
  loginBtn.hidden = false;
  logoutBtn.hidden = true;

  updateCommentFormState();
  openAuthModal("login");
  
  // Reset color after a moment
  setTimeout(() => {
    authStatus.style.color = "";
  }, 3000);
}

// ===========================
// KEYBOARD SHORTCUTS
// ===========================
document.addEventListener('keydown', (e) => {
  // Escape key closes modal
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeAuthModal();
  }
  
  // Enter key in modal submits form
  if (e.key === 'Enter' && !modal.classList.contains('hidden')) {
    if (e.target === authUsername || e.target === authPassword) {
      e.preventDefault();
      authSubmitBtn.click();
    }
  }
});

// ===========================
// INIT
// ===========================
checkAuth();