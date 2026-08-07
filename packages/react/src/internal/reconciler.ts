import type { ReactNode } from 'react';
import ReactReconciler from 'react-reconciler';
import { DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants.js';
import {
  appendChild,
  applyProps,
  createInstance,
  createTextInstance,
  insertBefore,
  refreshMeasure,
  removeChild,
  type Container,
  type HostType,
  type Instance,
  type TextInstance,
  type Yoga,
} from '@flowtty/core/host';

export type { Container } from '@flowtty/core/host';

type ReconcilerConfig = Parameters<
  typeof ReactReconciler<
    HostType,                       // Type
    Record<string, unknown>,        // Props
    Container,                      // Container
    Instance,                       // Instance
    TextInstance,                   // TextInstance
    never,                          // SuspenseInstance
    never,                          // HydratableInstance
    never,                          // FormInstance
    Instance | TextInstance,        // PublicInstance
    object,                         // HostContext
    never,                          // ChildSet (persistence unused)
    ReturnType<typeof setTimeout>,  // TimeoutHandle
    -1,                             // NoTimeout
    null                            // TransitionStatus (no form actions in this host)
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

  // Form-action transition plumbing (react-reconciler@0.33 reads the context's
  // _currentValue directly, mirroring react-dom's raw context object). This
  // host renders no form elements, so the status is permanently "not pending"
  // (TransitionStatus = null); the cast covers the null Provider/Consumer
  // slots the reconciler never touches.
  const HostTransitionContext = {
    $$typeof: Symbol.for('react.context'),
    Provider: null,
    Consumer: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0,
  } as unknown as ReconcilerConfig['HostTransitionContext'];

  // Fully typed against @types/react-reconciler@0.33, which matches the
  // runtime react-reconciler@0.33 — no casts; missing or extra host-config
  // members are typecheck errors.
  const config: ReconcilerConfig = {
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
      if (i >= 0) {
        container.children.splice(i, 1);
        if ((child as { type: string }).type === 'box') {
          (child as Instance).yogaNode.freeRecursive();
        }
      }
    },

    finalizeInitialChildren: () => false,
    shouldSetTextContent: () => false,
    // react-reconciler@0.31+ dropped the render-phase `prepareUpdate`; commit
    // gets `(instance, type, oldProps, newProps, fiber)` and we re-apply from
    // `newProps` (4th arg).
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

    // Priority API (0.31+ shape): the runtime reads these instead of the old
    // `getCurrentEventPriority`.
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
    // Suspensey-commit hooks: maySuspendCommit is false for every instance,
    // so preloadInstance / suspendInstance are never invoked.
    maySuspendCommit: () => false,
    preloadInstance: () => true,
    suspendInstance: () => {},
    startSuspendingCommit: () => {},
    waitForCommitToBeReady: () => null,
    NotPendingTransition: null,
    HostTransitionContext,
    preparePortalMount: () => {},
    requestPostPaintCallback: () => {},
    shouldAttemptEagerTransition: () => false,
    resetFormInstance: () => {},
    trackSchedulerEvent: () => {},
    resolveEventType: () => null,
    resolveEventTimeStamp: () => -1.1,
  };

  return ReactReconciler(config);
}

export interface Root {
  render(element: ReactNode): void;
  unmount(): void;
  flushSync(fn: () => void): void;
}

export function createRoot(Yoga: Yoga, onCommit?: () => void): { container: Container; root: Root } {
  const reconciler = createReconciler(Yoga, onCommit);
  const container: Container = { children: [], Yoga };
  const fiberRoot = reconciler.createContainer(
    container,
    0,
    null,
    false,
    null,
    '',
    (err: Error) => console.error(err),
    (err: Error) => console.error(err),
    (err: Error) => console.error(err),
    () => {}, // onDefaultTransitionIndicator — no visual pending indicator in this host
  );
  // react-reconciler@0.31+ splits container updates into async-scheduling
  // `updateContainer` (requests a lane via resolveUpdatePriority → scheduled
  // off-thread) and synchronous `updateContainerSync` + `flushSyncWork`. For a
  // host that renders frame-by-frame on demand we want a synchronous commit so
  // the host tree is fully built when `render()` returns.
  //
  // `flushSyncFromReconciler(fn)` runs `fn` under SyncLane priority and then
  // drains sync work — equivalent to React DOM's `flushSync`.
  return {
    container,
    root: {
      render(element) {
        reconciler.updateContainerSync(element, fiberRoot, null, null);
        reconciler.flushSyncWork();
      },
      unmount() {
        reconciler.updateContainerSync(null, fiberRoot, null, null);
        reconciler.flushSyncWork();
      },
      flushSync(fn) {
        // Discrete-event semantics (mirrors react-dom's event dispatch):
        // pending passive effects from prior commits must land before a new
        // event is processed. useInput (un)subscriptions live in effects, and
        // react-reconciler@0.33 defers them to a scheduler macrotask — without
        // this flush, a key arriving right after a commit is delivered through
        // stale subscriptions (e.g. a just-muted dialog still receiving input).
        reconciler.flushPassiveEffects();
        reconciler.flushSyncFromReconciler(fn);
      },
    },
  };
}
