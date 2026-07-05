export interface EntryStreamMetadata {
  author_name: string | null;
  created_at: string;
  id: string;
  preview_path: string;
}

export interface StreamMessage {
  data: string;
  event: string;
}

type Controller = ReadableStreamDefaultController<StreamMessage>;

const controllersBySurface = new Map<string, Set<Controller>>();

const getControllers = (surfaceId: string): Set<Controller> => {
  let set = controllersBySurface.get(surfaceId);
  if (!set) {
    set = new Set();
    controllersBySurface.set(surfaceId, set);
  }
  return set;
};

const removeController = (surfaceId: string, controller: Controller): void => {
  const set = controllersBySurface.get(surfaceId);
  set?.delete(controller);
  if (set?.size === 0) {
    controllersBySurface.delete(surfaceId);
  }
};

const broadcast = (surfaceId: string, message: StreamMessage): void => {
  const set = controllersBySurface.get(surfaceId);
  if (!set) {
    return;
  }
  for (const controller of set) {
    controller.enqueue(message);
  }
};

export const createSurfaceMessageStream = (
  surfaceId: string
): ReadableStream<StreamMessage> => {
  let activeController: Controller | null = null;

  return new ReadableStream<StreamMessage>({
    cancel() {
      if (activeController) {
        removeController(surfaceId, activeController);
        activeController = null;
      }
    },
    start(controller) {
      activeController = controller;
      getControllers(surfaceId).add(controller);
    },
  });
};

export const publishEntry = (
  surfaceId: string,
  entry: EntryStreamMetadata
): void => {
  broadcast(surfaceId, {
    data: JSON.stringify(entry),
    event: "entry",
  });
};

export const publishEntryRemoved = (
  surfaceId: string,
  entryId: string
): void => {
  broadcast(surfaceId, {
    data: JSON.stringify({ id: entryId }),
    event: "entry:removed",
  });
};
