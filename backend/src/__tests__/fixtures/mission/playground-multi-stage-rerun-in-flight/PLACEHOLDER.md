# playground-multi-stage-rerun-in-flight fixture (placeholder — combined-state §6.8.1.b)

To materialize:

- mission was completed then `POST /missions/:id/rerun` or stage-rerun triggered
- at least 2 stages have `attempts > 1`
- one rerun stage is currently `running`, another rerun stage already `done` second time
- `rerunnableStages` must reflect cascade behavior — denying re-rerun of stages cleared by current attempt
- exercises `stage-rerun.dispatcher.ts` cascade semantics
