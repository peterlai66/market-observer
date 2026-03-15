# Merge Note

This package merges:

- mo_handoff_2026-03-14_0.19.30.zip
- mo_docs_incremental_v7.zip

## Merge policy

- Original handoff package files were preserved as the primary source.
- New documentation files from the docs package were added when they did not already exist.
- If a filename already existed, the incoming docs version was preserved with a `_from_v7` suffix.

## Added files
- docs/repository_structure_snapshot.md
- docs/simulation_model.md
- docs/architecture/mo_ai_guardrails.md
- docs/architecture/mo_system_architecture.md
- docs/architecture/mo_full_system_map.md
- docs/architecture/mo_engineering_map.md
- docs/architecture/ai_handoff_rules.md
- docs/lifecycle/mo_runtime_pipeline.md
- docs/operator/operator_report_model.md
- docs/operator/line_commands.md
- docs/operator/ai_explain_layer.md
- docs/development/release_workflow.md
- docs/development/dev_package_flow.md
- docs/development/update_system.md
- docs/development/handoff_protocol.md

## Renamed due to conflict
- docs/README.md -> docs/README_from_v7.md