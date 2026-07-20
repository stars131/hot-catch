# Third-Party Notices

This project includes design and implementation ideas informed by the following
open-source projects. The implementation in this repository is adapted for a
cloud-only Next.js/PostgreSQL/BullMQ architecture and does not include desktop
agent, local filesystem, shell, tunnel, remote-control, or arbitrary MCP code.

## AionUi

- Project: [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi)
- Source revision reviewed: `cfa1d68`
- License: Apache License 2.0
- License copy: `licenses/AionUi-APACHE-2.0.txt`
- Referenced concepts: agent workbench layout, artifact-oriented interaction,
  status presentation, and explicit approval boundaries.

Copyright and license notices from any directly reused AionUi source file must
remain in that file together with the source commit and a summary of local
modifications. No AionUi source file is directly copied in the current change.

## LiveAgent

- Project: [Stack-Cairn/LiveAgent](https://github.com/Stack-Cairn/LiveAgent)
- Source revision reviewed: `08c24bf`
- License: MIT License
- License copy: `licenses/LiveAgent-MIT.txt`
- Referenced concepts: sequence-based event recovery, long-conversation
  checkpoints, progressive Skill loading, memory lifecycle, and scroll-follow
  behavior.

Copyright and license notices from any directly reused LiveAgent source file
must remain in that file together with the source commit and a summary of local
modifications. No LiveAgent source file is directly copied in the current
change; the runtime and UI code were implemented independently for this project.

## Agent Reach

- Project: [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)
- Source revision reviewed: `1494c2a`
- License: MIT License
- License copy: `licenses/Agent-Reach-MIT.txt`
- Referenced concepts: ordered backend candidates, per-backend failure
  isolation, actionable availability states, and explicit active-backend
  reporting.

No Agent Reach source file is directly copied in the current change. The
TypeScript routing and reference-import integration were implemented
independently for this project's cloud service and credential boundaries.

## TrendRadar

- Project: [sansan0/TrendRadar](https://github.com/sansan0/TrendRadar)
- Source revision reviewed: `8ee26026ba6c11dec41a95fb3895a7162876caa1`
- License: GNU General Public License v3.0
- Referenced concepts: persisted trend timelines, new-topic detection,
  user-selectable observation windows, interest filtering, digest modes,
  custom RSS, and scheduled notifications.

No TrendRadar source file is copied into this repository. The PostgreSQL data
model, TypeScript trend calculations, API integration, and React presentation
were implemented independently for STARTRACE's per-user cloud architecture.
