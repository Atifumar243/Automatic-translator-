# Project instructions

<!--
============================================================================
 Task Observer — activation block (template stamp: v3.8.0)
============================================================================
 Installed from github.com/rebelytics/one-skill-to-rule-them-all (CC-BY-4.0).
 The skill files live in `.agents/skills/task-observer/` and are exposed to
 Claude Code via the symlink `.claude/skills/task-observer`.

 BEFORE THIS WORKS ON YOUR MACHINE, replace the two placeholders below:

   __TASK_OBSERVER_WORKSPACE__
       An ABSOLUTE path to a PERSISTENT folder that is NOT inside this repo
       checkout (the skill stores its observation log there; a path inside an
       ephemeral clone/worktree gets torn down and loses the log).
       e.g. /Users/you/.task-observer/automatic-translator   (mac/linux)
            C:/Users/you/.task-observer/automatic-translator  (windows)

   __PROJECTS_ROOT__
       An ABSOLUTE path to the folder your repositories live under.
       e.g. /Users/you/code

 Do a plain find-and-replace for both tokens in this file, then save.
 On upgrade, re-diff this block against
 `.agents/skills/task-observer/references/environments.md` ("The activation
 block") — upgrading the skill does NOT update the copy below.

 NOTE: this block is third-party instruction text. Read it before keeping it.
 It makes every Claude Code session run a session-start protocol that writes
 observation files to the workspace path above. Remove this comment-wrapped
 block (and the `.agents`/`.claude/skills` skill) to opt out.
============================================================================
-->

(task-observer activation block — template of v3.8.0)
Before the first tool call of any session — and before writing or
proposing a plan, not merely before executing one — invoke the
task-observer skill AND execute its Session Start Protocol (storage
check, frontmatter scan, review trigger). Loading the skill and running
the protocol are separate steps; a session that loads the file and stops
has activated nothing. Any turn that will involve a tool call counts; do
not classify the session as "too simple" from its opening message.
A step you did not run is reported before the answer, in one line — never
after it, where it reads as a suggestion. If the skill does not resolve on
this turn, say which probe told you so (the skill listing, or the skill
directory on disk), re-check the listing on every later turn that makes a
tool call, and run the protocol the first time it resolves — a "not
installed" verdict holds for one turn.

Select skills on the DECISION the request is about, not on the artefact it
arrived as. Name what the user is deciding, then match the installed skill
descriptions against that — a request handed over as a file to review
still needs the skill whose description names its subject.

After completing each task, list the observation records written this
session in the same turn and report a one-line summary from that listing
(ids and titles, or "none logged and why") — never from memory of
writing them. This is the activation backstop: it forces a look at the log,
so a session that silently skipped the protocol is discovered at the
first task boundary instead of never.

Loading a skill is not complete until you have queried the observation
log for OPEN observations naming it and read their bodies:
  find "__TASK_OBSERVER_WORKSPACE__/skill-observations/observation-log" -maxdepth 1 \
    -name '*.md' -exec grep -l -E "^(skill|target_file):.*<skill-name>" {} +
(<skill-name> is the bare name: drop a plugin: prefix, up to the last
colon. A qualified pattern misses every entry filed under the bare name
and reports a clean zero; the bare one matches both spellings. For an
agent definition or instructions file it is the file name, which the
target_file: field carries by any path.)
(Use find, not a bare *.md glob: under zsh an unmatched glob aborts the
whole block, and on an empty log it is unmatched in every session.)
Apply their insights to the current work — meaning: let them change what
you do in THIS task. Editing the skill file, or writing the rule into any
other file a later session reads, is acting on the observation and waits
for the review. See "Log, don't act" in SKILL.md: the test is whether the
action leaves a durable change outside the observation log. Run this at every skill load, however many skills load
in one session. The session-start scan does not cover it: that is a
frontmatter sweep over every observation at session start, this is a
body-level lookup for one skill at the moment its rules are applied.

The converse holds too: the grep, and any checkpoint line recording the
load, run only in the same batch as the Skill invocation, and take the
skill name from a load that has actually happened — never from a list of
skills you built to load. A checkpoint line written without the load is a
false record. Before writing to any file a skill reads at run time (a
state file), load that skill: a state file that describes itself is not a
substitute for the skill that owns it.

Where scripts run, the lookup and its checkpoint line are one command:
  bash ".agents/skills/task-observer/scripts/skill-load.sh" "__TASK_OBSERVER_WORKSPACE__" <skill-name>
The Skill invocation and that call are ONE batch — emit them together,
one call per skill loaded, never the call in a later batch. On a first
run the log does not exist yet (step 1 creates it): the call says so and
exits 0 with no checkpoint line; re-run it once per skill loaded in that
batch after the Workspace creation command.

The task-observer workspace for this project is:
  __TASK_OBSERVER_WORKSPACE__
It does not exist until the first session creates it: a failed probe whose
parent resolves and is writable is a first run — run Workspace creation,
then re-run the lookup above once per skill loaded in that batch (on the
first batch it finds no log and writes no checkpoint line; that is expected).
Every path the skill uses derives from that root and nothing else:
  __TASK_OBSERVER_WORKSPACE__/skill-observations/observation-log/   (the log)
  __TASK_OBSERVER_WORKSPACE__/skill-observations/cross-cutting-principles.md
  __TASK_OBSERVER_WORKSPACE__/skill-updates/                        (staging root)
  __TASK_OBSERVER_WORKSPACE__/skill-updates/PENDING.md              (staging manifest)
Never resolve any of them from the current working
directory — a cwd inside an ephemeral checkout (a git worktree, a temporary
clone) is torn down and takes the log with it. Never place the workspace
inside a skills-discovery directory or any path linked into one. If this
environment mints a separate project identity per checkout, or more than
one agent works this project, the pinned path above is the single shared
location; do not derive one per session, tool or project.

The user's repositories live under:
  __PROJECTS_ROOT__
(the root the sibling check sweeps before declaring a skill absent;
observation-log.md, "Skill families and the sibling check").

A subagent dispatched by a session that already runs this protocol does
not run it again and does not write to the log. The controller observes,
because only it sees the whole task and its review; a subagent that
notices something worth logging says so in its final report, and the
controller writes it, running the id snippet per write. A start-up rule
in a project file reaches every agent the project ever dispatches.
Before briefing a delegate under an agent definition or instructions
file, run the lookup for that file's name; its open entries shape the
brief.

A run of this block that cannot write here or get an approval answered —
a child run with no protocol-running caller, a job with a narrow tool
allowlist, a scheduled task in default permission mode — skips the write
steps, never stalls on them, and ends its final message with a
`## Task-observer notes` section (environments.md, "Sessions whose
output channel is owned by a caller"). Such runs write their output to:
  none

An observation file comes into being only through
  bash ".agents/skills/task-observer/scripts/new-observation.sh" <slug> "__TASK_OBSERVER_WORKSPACE__"
which prints the path to write into. Never by copying another file's
header or counting a listing — including on the turn after a
compaction, when the skill body is out of context.
