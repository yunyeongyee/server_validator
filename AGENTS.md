# Repository workflow

The user prefers FastAPI, React/TypeScript, Pillow, optional OpenAI, and run.bat.
OpenAI credentials must not be required for local document preview and validation.

Start subsequent work on a new branch. Do not edit main directly. Test changes on
the work branch, then integrate a reviewed release into main. The user explicitly
authorized publishing this initial mockup and its ZIP to main; do not force-push
or discard concurrent remote changes.

Keep text files CRLF. Do not commit user PC calibration, image mappings, secrets,
uploaded source files, or .local data. Use only real uploaded Dell artwork.
Unverified specifications must remain unknown, not compatible. Inspect original
document evidence and preserve human review before final approval.

Each cloud task is already isolated. Use the existing checkout and do not create
a Git worktree unless the user explicitly requests one.
