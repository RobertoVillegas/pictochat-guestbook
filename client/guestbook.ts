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

const renderFeedCard = (entry: FeedEntry): string =>
  `<article class="feed-card" data-id="${entry.id}">
  <img src="${mediaUrl(entry.preview_path)}" alt="${entry.author_name ?? "entry"}" width="${entry.preview_width}" height="${entry.preview_height}" />
  <p>${entry.author_name ? escapeHtml(entry.author_name) : "Anonymous"}</p>
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

  source.addEventListener("entry", (event) => {
    const entry = JSON.parse(event.data) as StreamEntry;
    prependFeedCard({
      ...entry,
      preview_height: 192,
      preview_width: 256,
    });
  });

  source.addEventListener("entry:removed", (event) => {
    const payload = JSON.parse(event.data) as { id: string };
    removeFeedCard(payload.id);
  });
};

const root = document.querySelector<HTMLElement>(".guestbook");
const surfaceSlug = root?.dataset.surface;
if (surfaceSlug) {
  void loadFeed(surfaceSlug);
  connectStream(surfaceSlug);
}

const submitButton = document.querySelector("#submit-entry");
submitButton?.addEventListener("click", async () => {
  const status = document.querySelector("#submit-status");
  const authorInput = document.querySelector(
    "#author-name"
  ) as HTMLInputElement | null;
  const editor = window.pictoEditor;

  if (!surfaceSlug || !editor) {
    if (status) {
      status.textContent = "Editor unavailable.";
    }
    return;
  }

  const payload = {
    author_name: authorInput?.value.trim() || undefined,
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
  }
});
