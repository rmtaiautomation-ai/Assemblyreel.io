# Feature organization

Each directory owns one user-facing capability. Keep its React UI in `components/` and
its Next.js server actions in `server/`. Feature-private types and helpers should stay
inside that feature instead of being added to a global `utils` directory.

Cross-feature imports should use the `@/features/...` alias so ownership remains visible.
Move code into `src/lib` only when it is genuinely framework-neutral and shared by more
than one feature.
