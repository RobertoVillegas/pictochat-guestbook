const loginForm = document.querySelector(
  "#login-form"
) as HTMLFormElement | null;
const loginError = document.querySelector("#login-error");

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const response = await fetch("/api/auth/sign-in/email", {
    body: JSON.stringify({ email, password }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (response.ok) {
    window.location.href = "/admin";
    return;
  }

  if (loginError) {
    loginError.hidden = false;
    loginError.textContent = "Invalid credentials.";
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-action]"
)) {
  button.addEventListener("click", async () => {
    const article = button.closest<HTMLElement>(".admin-entry");
    const id = article?.dataset.id;
    const { action } = button.dataset;
    if (!id || !action) {
      return;
    }

    let method = "POST";
    let path = `/admin/entries/${id}/${action}`;
    if (action === "delete") {
      method = "DELETE";
      path = `/admin/entries/${id}`;
    }

    const response = await fetch(path, {
      credentials: "include",
      method,
    });

    if (response.ok) {
      article?.remove();
    }
  });
}
