const AUTHOR_STORAGE_KEY = "picto-author-name";

interface FeedEntry {
  id: string;
  author_name: string | null;
  preview_path: string;
  preview_width: number;
  preview_height: number;
  created_at: string;
}

interface StreamEntry {
  id: string;
  author_name: string | null;
  preview_path: string;
  created_at: string;
}

const previewsPrefixRegex = /^previews\//u;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const mediaUrl = (previewPath: string): string =>
  `/media/${previewPath.replace(previewsPrefixRegex, "")}`;

const displayName = (authorName: string | null): string =>
  authorName ? escapeHtml(authorName) : "Anonymous";

const renderFeedCard = (entry: FeedEntry): string =>
  `<article class="picto-message-card" data-id="${entry.id}">
  <div class="picto-nametag">
    <img src="/picto-ds/sprites/nametag-pill.png" alt="" width="64" height="22" />
    <span class="picto-nametag-text">${displayName(entry.author_name)}</span>
  </div>
  <img class="picto-message-preview" src="${mediaUrl(entry.preview_path)}" alt="${entry.author_name ?? "entry"}" width="${entry.preview_width}" height="${entry.preview_height}" />
</article>`;

const prependFeedCard = (entry: FeedEntry): void => {
  const feed = document.querySelector("#feed");
  if (!feed) {
    return;
  }
  if (feed.querySelector(`[data-id="${entry.id}"]`)) {
    return;
  }
  feed.insertAdjacentHTML("afterbegin", renderFeedCard(entry));
};

const removeFeedCard = (entryId: string): void => {
  document.querySelector(`[data-id="${entryId}"]`)?.remove();
};

const loadFeed = async (surfaceSlug: string): Promise<void> => {
  const feed = document.querySelector("#feed");
  if (!feed) {
    return;
  }

  const response = await fetch(
    `/api/surfaces/${encodeURIComponent(surfaceSlug)}/entries`
  );
  if (!response.ok) {
    feed.textContent = "Could not load the feed.";
    return;
  }

  const entries = (await response.json()) as FeedEntry[];
  feed.innerHTML = entries.map((entry) => renderFeedCard(entry)).join("");
};

const connectStream = (surfaceSlug: string): void => {
  const source = new EventSource(
    `/api/surfaces/${encodeURIComponent(surfaceSlug)}/stream`
  );

  // events published while the stream was down are lost; re-sync on reconnect
  let dropped = false;
  source.addEventListener("error", () => {
    dropped = true;
  });
  source.addEventListener("open", () => {
    if (dropped) {
      dropped = false;
      void loadFeed(surfaceSlug);
    }
  });

  source.addEventListener("entry", (event) => {
    const entry = JSON.parse(event.data) as StreamEntry;
    prependFeedCard({
      ...entry,
      preview_height: 79,
      preview_width: 228,
    });
  });

  source.addEventListener("entry:removed", (event) => {
    const payload = JSON.parse(event.data) as { id: string };
    removeFeedCard(payload.id);
  });
};

const root = document.querySelector<HTMLElement>(".guestbook");
const surfaceSlug = root?.dataset.surface;

const authorInput = document.querySelector(
  "#author-name"
) as HTMLInputElement | null;

if (authorInput) {
  const savedName = localStorage.getItem(AUTHOR_STORAGE_KEY);
  if (savedName) {
    authorInput.value = savedName;
  }
  authorInput.addEventListener("change", () => {
    const trimmed = authorInput.value.trim();
    if (trimmed) {
      localStorage.setItem(AUTHOR_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(AUTHOR_STORAGE_KEY);
    }
  });
}

if (surfaceSlug) {
  void loadFeed(surfaceSlug);
  connectStream(surfaceSlug);
}

const submitEntry = async (): Promise<void> => {
  const status = document.querySelector("#submit-status");
  const editor = window.pictoEditor;

  if (!surfaceSlug || !editor) {
    if (status) {
      status.textContent = "Editor unavailable.";
    }
    return;
  }

  const authorName = authorInput?.value.trim() || undefined;
  if (authorName) {
    localStorage.setItem(AUTHOR_STORAGE_KEY, authorName);
  }

  const payload = {
    author_name: authorName,
    card: editor.buildPictoCard(),
    preview: editor.buildPreviewDataUrl(),
  };

  const response = await fetch(
    `/api/surfaces/${encodeURIComponent(surfaceSlug)}/entries`,
    {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );

  if (status) {
    if (!response.ok) {
      status.textContent = `Failed to submit (${response.status}).`;
      return;
    }

    const body = (await response.json()) as { status: string };
    status.textContent =
      body.status === "approved"
        ? "Entry published."
        : "Entry submitted (pending moderation).";
    editor.resetEditor();
  }
};

document.querySelector("#submit-entry")?.addEventListener("click", () => {
  void submitEntry();
});
