import type { ReactNode } from 'react';
import ReactReconciler from 'react-reconciler';
import { DefaultEventPriority } from 'react-reconciler/constants.js';
import type { Yoga } from './yoga.js';
import {
  appendChild,
  applyProps,
  createInstance,
  createTextInstance,
  insertBefore,
  refreshMeasure,
  removeChild,
  type HostType,
  type Instance,
  type TextInstance,
} from './host.js';

export interface Container {
  children: Instance[];
  Yoga: Yoga;
}

// `react-reconciler/constants.js` exports `NoEventPriority` (= 0) at runtime,
// but `@types/react-reconciler@0.28.9`'s `constants.d.ts` does not re-export it.
// It's a stable React internal sentinel; declare it locally to stay typecheck-clean.
const NoEventPriority = 0;

type ReconcilerConfig = Parameters<
  typeof ReactReconciler<
    HostType,
    Record<string, unknown>,
    Container,
    Instance,
    TextInstance,
    never,
    never,
    Instance | TextInstance,
    object,
    true,
    never,
    ReturnType<typeof setTimeout>,
    -1
  >
>[0];

export function createReconciler(Yoga: Yoga, onCommit?: () => void) {
  let pending = false;
  const schedulePaint = () => {
    if (pending || !onCommit) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      onCommit();
    });
  };

  // The current update priority is closure state per reconciler instance,
  // following the standard react-dom / ink pattern.
  let currentUpdatePriority: number = NoEventPriority;

  // react-reconciler@0.31.0 requires more host-config methods than
  // `@types/react-reconciler@0.28.9` declares (the priority API was reworked:
  // runtime reads `setCurrentUpdatePriority` / `getCurrentUpdatePriority` /
  // `resolveUpdatePriority` instead of `getCurrentEventPriority`, plus the
  // suspense-commit / scheduler-event methods). The lagging type rejects those
  // as unknown properties, so we build the full runtime-correct config and pass
  // it through a single cast at the call site. Runtime correctness wins over the
  // stale types.
  const config = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: true,
    noTimeout: -1,
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,

    createInstance: (type: HostType, props: Record<string, unknown>) =>
      createInstance(type, props as never, Yoga),
    createTextInstance: (text: string) => createTextInstance(text, Yoga),

    appendInitialChild: (parent: Instance, child: Instance | TextInstance) => appendChild(parent, child, Yoga),
    appendChild: (parent: Instance, child: Instance | TextInstance) => appendChild(parent, child, Yoga),
    appendChildToContainer: (container: Container, child: Instance | TextInstance) => {
      if (child.type === 'box') container.children.push(child);
    },
    insertBefore: (parent: Instance, child: Instance | TextInstance, before: Instance | TextInstance) =>
      insertBefore(parent, child, before, Yoga),
    insertInContainerBefore: (
      container: Container,
      child: Instance | TextInstance,
      before: Instance | TextInstance,
    ) => {
      const i = container.children.indexOf(before as Instance);
      container.children.splice(i < 0 ? container.children.length : i, 0, child as Instance);
    },
    removeChild: (parent: Instance, child: Instance | TextInstance) => removeChild(parent, child, Yoga),
    removeChildFromContainer: (container: Container, child: Instance | TextInstance) => {
      const i = container.children.indexOf(child as Instance);
      if (i >= 0) container.children.splice(i, 1);
      if ((child as { type: string }).type === 'box') {
        (child as Instance).yogaNode.freeRecursive();
      }
    },

    finalizeInitialChildren: () => false,
    shouldSetTextContent: () => false,
    // react-reconciler@0.31.0 dropped the render-phase `prepareUpdate` and calls
    // `commitUpdate(instance, type, oldProps, newProps, fiber)` at runtime
    // (verified against the cjs `commitHostUpdate` call site). `@types@0.28.9`
    // still declares the legacy payload-carrying form, hence the cast at the
    // `ReactReconciler(...)` call. We re-apply from `newProps` (4th arg).
    commitUpdate: (
      instance: Instance,
      _type: HostType,
      _oldProps: Record<string, unknown>,
      newProps: Record<string, unknown>,
    ) => applyProps(instance, newProps as never, Yoga),
    commitTextUpdate: (textInstance: TextInstance, _oldText: string, newText: string) => {
      textInstance.text = newText;
      if (textInstance.parent) refreshMeasure(textInstance.parent, Yoga);
    },

    getRootHostContext: () => ({}),
    getChildHostContext: (parent: object) => parent,
    getPublicInstance: (instance: Instance | TextInstance) => instance,
    prepareForCommit: () => null,
    resetAfterCommit: () => { schedulePaint(); },
    clearContainer: (container: Container) => {
      for (const c of container.children) c.yogaNode.freeRecursive();
      container.children = [];
    },

    // Priority API (0.31.0 shape).
    // VERIFIED-RUNTIME-REQUIRED — do NOT remove these three even though static
    // analysis flags them as unused. react-reconciler@0.31.0 reads them off
    // the host config via `$$$config.<name>` destructuring at mount time;
    // @types/react-reconciler@0.28.9 doesn't declare them, so the TS service
    // can't see the consumer. Removing any of them crashes mount with
    // "X is not a function". Confirmed in M0 T5 review.
    setCurrentUpdatePriority: (priority: number) => {
      currentUpdatePriority = priority;
    },
    getCurrentUpdatePriority: () => currentUpdatePriority,
    resolveUpdatePriority: () =>
      currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority,

    detachDeletedInstance: () => {},
    getInstanceFromNode: () => null,
    beforeActiveInstanceBlur: () => {},
    afterActiveInstanceBlur: () => {},
    prepareScopeUpdate: () => {},
    getInstanceFromScope: () => null,
    supportsMicrotasks: true,
    scheduleMicrotask: queueMicrotask,
    maySuspendCommit: () => false,
    startSuspendingCommit: () => {},
    waitForCommitToBeReady: () => null,
    preparePortalMount: () => {},
    requestPostPaintCallback: () => {},
    shouldAttemptEagerTransition: () => false,
    resetFormInstance: () => {},
    trackSchedulerEvent: () => {},
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
  };

  return ReactReconciler(config as unknown as ReconcilerConfig);
}

export interface Root {
  render(element: ReactNode): void;
  unmount(): void;
}

export function createRoot(Yoga: Yoga, onCommit?: () => void): { container: Container; root: Root } {
  const reconciler = createReconciler(Yoga, onCommit);
  const container: Container = { children: [], Yoga };
  // react-reconciler@0.31.0's runtime `createContainer` takes 10 args (three
  // error callbacks: onUncaughtError, onCaughtError, onRecoverableError), but
  // `@types/react-reconciler@0.28.9` still declares the legacy 8-arg form
  // (single onRecoverableError). Call with the runtime-correct 10 args via a
  // narrow cast so the error callbacks route correctly at runtime.
  const createContainer = reconciler.createContainer as unknown as (
    containerInfo: Container,
    tag: number,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null | boolean,
    identifierPrefix: string,
    onUncaughtError: (err: unknown) => void,
    onCaughtError: (err: unknown) => void,
    onRecoverableError: (err: unknown) => void,
    transitionCallbacks: null,
  ) => ReturnType<typeof reconciler.createContainer>;
  const fiberRoot = createContainer(
    container,
    0,
    null,
    false,
    null,
    '',
    (err: unknown) => console.error(err),
    (err: unknown) => console.error(err),
    (err: unknown) => console.error(err),
    null,
  );
  // react-reconciler@0.31.0 splits container updates into async-scheduling
  // `updateContainer` (requests a lane via resolveUpdatePriority → scheduled
  // off-thread) and synchronous `updateContainerSync` + `flushSyncWork`. For a
  // host that renders frame-by-frame on demand we want a synchronous commit so
  // the host tree is fully built when `render()` returns. `@types@0.28.9` knows
  // neither method, so reach them through a cast.
  const sync = reconciler as unknown as {
    updateContainerSync(
      element: ReactNode,
      container: typeof fiberRoot,
      parentComponent: null,
      callback: null,
    ): void;
    flushSyncWork(): void;
  };
  return {
    container,
    root: {
      render(element) {
        sync.updateContainerSync(element, fiberRoot, null, null);
        sync.flushSyncWork();
      },
      unmount() {
        sync.updateContainerSync(null, fiberRoot, null, null);
        sync.flushSyncWork();
      },
    },
  };
}
