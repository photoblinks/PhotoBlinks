# PhotoBlinks Cline Tooling & Discovery Rules

## CODE REVIEW GRAPH FIRST
When the Code Review Graph is available, use it before broad filesystem searching.

Preferred sequence:
- get_minimal_context
- semantic_search_nodes / query_graph
- get_impact_radius / get_affected_flows when impact matters
- query_graph for callers and callees, imports, and tests
- get_architecture_overview when architecture context is needed
- detect_changes + get_review_context for reviewing changes

Use targeted file reads only after graph results narrow the scope.

## CURRENT CLINE GRAPH LIMITATION
The Code Review Graph server is configured and populated for this repository, but the current Cline session may not expose its MCP functions as live tools.

If MCP functions are unavailable:
- use the Code Review Graph CLI through the available terminal capability where appropriate
- do not reinstall or duplicate Code Review Graph
- do not rebuild the graph unnecessarily
- keep CLI usage targeted

## FALLBACK ORDER
If graph information is insufficient:

Code Review Graph -> targeted file read -> targeted search -> targeted terminal inspection

Never begin with a broad repository dump.

## OTHER AVAILABLE TOOLS
- Filesystem/code search for targeted source inspection
- Terminal for targeted repository/package/config inspection
- Web fetching only when external documentation is genuinely needed
- Ask for clarification rather than inventing requirements

## OUTPUT DISCIPLINE
For discovery:
- Identify exact files/components/functions/tables/policies
- Explain relationships briefly
- Distinguish facts from recommendations
- Do not produce unnecessary code
- Do not produce an implementation plan unless requested

For review:
- Identify concrete findings
- Include severity/confidence
- Identify affected files/flows
- Do not modify code unless explicitly authorized

## NEXT.JS
Before changing Next.js code, follow the project's AGENTS.md guidance and inspect the canonical installed Next.js documentation when required.

## DATABASE/R2
For database or storage investigation:
- Inspect existing migrations/RLS/storage implementation first
- Do not invent duplicate tables/functions/storage mechanisms
- Preserve Supabase/R2 architecture