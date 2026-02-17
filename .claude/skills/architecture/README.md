# Architecture Skills

> System design and architectural patterns for Genesis.ai.

## Skills Overview

| Skill                                               | Description                      | Trigger Keywords          |
| --------------------------------------------------- | -------------------------------- | ------------------------- |
| [document-processor](document-processor/SKILL.md)   | Document parsing and generation  | document, parser, export  |
| [mcp-builder](mcp-builder/SKILL.md)                 | MCP server development           | mcp, tool, server         |
| [schema-architect](schema-architect/SKILL.md)       | Database schema design           | schema, prisma, migration |
| [security-specialist](security-specialist/SKILL.md) | Authentication and authorization | auth, jwt, rbac, security |

## Quick Reference

### Architecture Decision Flow

```
1. Schema changes? → schema-architect
2. Auth/Security? → security-specialist
3. Document handling? → document-processor
4. MCP integration? → mcp-builder
```

### Key Patterns

- **Database**: Prisma ORM with PostgreSQL
- **Auth**: JWT + RBAC with NestJS Guards
- **Documents**: Template-based generation with multiple formats

## Related Categories

- [AI](../ai/README.md) - AI architecture layering
- [Development](../development/README.md) - Implementation patterns
