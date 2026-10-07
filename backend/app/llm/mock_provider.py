"""Deterministic offline provider so the app runs without an API key.

Picks a canned response by keyword in the last user message so every kind of rich
content (table, lists, code, chart, image) can be demoed on demand, and streams it in
small chunks with a short delay so streaming is visible in the UI.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.llm.base import (
    Action,
    ActionsEvent,
    ChatMessage,
    GenerationSettings,
    StreamEvent,
    TextDelta,
)

IMAGE_URL = "/static/images/mountain-lake.svg"


@dataclass(frozen=True)
class CannedResponse:
    keyword: str
    text: str
    actions: tuple[Action, ...]


TABLE = """\
Here's a comparison of popular programming languages:

| Language | Typing | Typical use | Learning curve |
|---|---|---|---|
| Python | Dynamic | Data science, backends, scripting | Gentle |
| TypeScript | Static | Web frontends, Node.js services | Moderate |
| Go | Static | Cloud services, CLIs | Gentle |
| Rust | Static | Systems, performance-critical code | Steep |

**Takeaway:** pick the language whose ecosystem matches the problem you're solving.
"""

LISTS = """\
Here's a plan for learning web development:

1. **Foundations**
   - HTML: semantic structure
   - CSS: layout with *flexbox* and *grid*
   - JavaScript basics
2. **Frontend framework**
   - React fundamentals
     - Components and props
     - State and effects
   - Routing and data fetching
3. **Backend**
   - REST API design
   - Databases and migrations

Checklist:
- [x] Pick a project idea
- [ ] Build a first version
- [ ] Deploy it
"""

CODE = """\
Here's the same idea in two languages: debounce a function so it only runs after the \
caller stops calling it.

```python
import asyncio
from collections.abc import Awaitable, Callable


def debounce(delay: float, fn: Callable[[], Awaitable[None]]) -> Callable[[], None]:
    task: asyncio.Task[None] | None = None

    def trigger() -> None:
        nonlocal task
        if task:
            task.cancel()

        async def run() -> None:
            await asyncio.sleep(delay)
            await fn()

        task = asyncio.create_task(run())

    return trigger
```

```typescript
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: T) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
```

Both versions cancel the pending call whenever a new one arrives.
"""

CHART_SPEC = {
    "type": "bar",
    "title": "Monthly active users (thousands)",
    "xKey": "month",
    "series": [
        {"key": "web", "name": "Web"},
        {"key": "mobile", "name": "Mobile"},
    ],
    "data": [
        {"month": "Jan", "web": 42, "mobile": 30},
        {"month": "Feb", "web": 48, "mobile": 36},
        {"month": "Mar", "web": 55, "mobile": 45},
        {"month": "Apr", "web": 61, "mobile": 58},
        {"month": "May", "web": 66, "mobile": 71},
        {"month": "Jun", "web": 70, "mobile": 84},
    ],
}

CHART = f"""\
Here's how monthly active users grew in the first half of the year:

```chart
{json.dumps(CHART_SPEC, indent=2)}
```

Mobile overtook web in **May** and is growing about twice as fast.
"""

IMAGE = f"""\
Here's an illustration of a mountain lake at sunset:

![Mountain lake at sunset]({IMAGE_URL})

Images in responses are regular Markdown, so any reachable URL works.
"""

RESPONSES: tuple[CannedResponse, ...] = (
    CannedResponse(
        "table",
        TABLE,
        (
            Action("Add performance", "Add a column comparing runtime performance to the table"),
            Action("Show as chart", "Show this comparison as a chart"),
            Action("Which first?", "Which of these languages should I learn first?"),
        ),
    ),
    CannedResponse(
        "chart",
        CHART,
        (
            Action("Show as table", "Show the same data as a table"),
            Action("Explain the trend", "What explains the mobile growth trend?"),
        ),
    ),
    CannedResponse(
        "code",
        CODE,
        (
            Action("Add tests", "Write unit tests for the debounce code"),
            Action("Explain line by line", "Explain the TypeScript code line by line"),
            Action("Throttle instead", "Show a throttle function instead"),
        ),
    ),
    CannedResponse(
        "image",
        IMAGE,
        (
            Action("Describe it", "Describe the image in more detail"),
            Action("Another one", "Show me another image"),
        ),
    ),
    CannedResponse(
        "list",
        LISTS,
        (
            Action("Add timeline", "Add a week-by-week timeline to this plan"),
            Action("Project ideas", "Give me three beginner project ideas"),
            Action("As a table", "Show the plan as a table"),
        ),
    ),
)

DEMO_ACTIONS = (
    Action("Show a table", "Show me a table comparing programming languages"),
    Action("Draw a chart", "Draw a chart of monthly active users"),
    Action("Write some code", "Show me some code examples"),
)

_CHUNK = re.compile(r"\S+\s*|\s+")


def _default_response(prompt: str) -> str:
    topic = " ".join(prompt.split())[:120] or "your question"
    return f"""\
Great question about **{topic}**.

I'm the built-in *mock* model, so I don't call a real LLM. I stream canned answers \
to demo the interface without an API key. Try asking for:

- a **table** (comparisons)
- a **list** (nested lists and a checklist)
- some **code** (Python and TypeScript, with syntax highlighting)
- a **chart** (rendered with Recharts)
- an **image**

> Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to chat with Claude instead.
"""


def pick_response(prompt: str) -> tuple[str, tuple[Action, ...]]:
    lowered = prompt.lower()
    for response in RESPONSES:
        if re.search(rf"\b{response.keyword}s?\b", lowered):
            return response.text, response.actions
    return _default_response(prompt), DEMO_ACTIONS


class MockProvider:
    def __init__(self, delay_seconds: float = 0.02) -> None:
        self.delay_seconds = delay_seconds

    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[StreamEvent]:
        last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        text, actions = pick_response(last_user)

        for chunk in _CHUNK.findall(text):
            if self.delay_seconds:
                await asyncio.sleep(self.delay_seconds)
            yield TextDelta(chunk)

        yield ActionsEvent(list(actions))
