/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
import fs from "node:fs/promises"
import path from "node:path"
import type { RunState } from "./types.ts"
import { formatIndicator, selectRun, summarizeRun } from "./presentation.ts"

type Summary = ReturnType<typeof summarizeRun> & { heartbeatAt?: number }

const tui: TuiPlugin = async (api) => {
  const [runs, setRuns] = createSignal<Summary[]>([])
  const [wide, setWide] = createSignal(true)
  const directory = api.state.path.worktree || api.state.path.directory
  const root = directory.replace(/[\\/]$/, "")

  async function refresh() {
    try {
      const current = JSON.parse(await fs.readFile(path.join(root, ".opencode", ".teamlead", "presentation.json"), "utf8")) as Summary[]
      if (Array.isArray(current)) setRuns(current.filter((item) => item && typeof item.id === "string"))
    } catch { /* No TeamLead run yet. */ }
  }

  function current(sessionID?: string) {
    const selected = selectRun(runs() as unknown as RunState[], sessionID) as unknown as Summary | undefined
    if (!selected) return
    return selected.heartbeatAt && Date.now() - selected.heartbeatAt < 6500
      ? selected : { ...selected, interrupted: ["running", "review", "repair"].includes(selected.status), active: 0 }
  }

  const execute = async (name: string, args = "") => {
    api.ui.dialog.clear()
    const route = api.route.current
    if (route.name !== "session") {
      api.ui.toast({ variant: "info", message: "Откройте сессию OpenCode для выполнения команды" })
      return
    }
    try {
      const result = await api.client.session.command({ sessionID: route.params.sessionID, directory, command: name, arguments: args })
      if (result.error) api.ui.toast({ variant: "error", message: `Не удалось запустить /${name}` })
    } catch { api.ui.toast({ variant: "error", message: `Не удалось запустить /${name}` }) }
    void refresh()
  }

  function prompt(title: string, command: string) {
    api.ui.dialog.replace(() => <api.ui.DialogPrompt title={title} onConfirm={(value) => {
      if (value.trim()) void execute(command, value.trim())
    }} />)
  }

  function details() {
    void refresh().then(() => {
      const route = api.route.current
      const selected = current(route.name === "session" ? route.params.sessionID : undefined)
      const message = selected
        ? `${formatIndicator(selected)}\n${selected.goal}\nID: ${selected.id}\n` +
          `Оценка: ${selected.estimatedTokens} токенов, $${selected.estimatedCostUsd.toFixed(4)}\n` +
          selected.tasks.map((task) => `${task.status}: ${task.id}${task.model ? ` (${task.model})` : ""}`).join("\n") +
          (selected.error ? `\nОшибка: ${selected.error}` : "")
        : "Запусков TeamLead пока нет"
      api.ui.dialog.replace(() => <api.ui.DialogAlert title="TeamLead" message={message} />)
    })
  }

  function history() {
    void refresh().then(() => api.ui.dialog.replace(() => <api.ui.DialogSelect title="Запуски TeamLead" options={runs().map((run) => ({
      title: `${run.status} · ${run.goal.slice(0, 55)}`,
      description: `${run.id} · ${run.completed}/${run.total} задач`,
      value: run.id,
      onSelect: () => api.ui.dialog.replace(() => <api.ui.DialogAlert title={`TeamLead ${run.id}`} message={`${formatIndicator(run)}\n${run.goal}\n${run.tasks.map((task) => `${task.status}: ${task.id}`).join("\n")}`} />),
    }))} />))
  }

  function menu() {
    api.ui.dialog.replace(() => <api.ui.DialogSelect title="TeamLead" options={[
      { title: "Текущий запуск", value: "status", onSelect: details },
      { title: "Запустить задачу…", value: "execute", onSelect: () => prompt("Задача TeamLead", "lead") },
      { title: "Предварительный план…", value: "plan", onSelect: () => prompt("План TeamLead", "lead-plan") },
      { title: "Продолжить запуск", value: "resume", disabled: !runs().some((run) => ["planned", "repair_required"].includes(run.status) || run.interrupted), onSelect: () => void execute("lead-resume") },
      { title: "История запусков", value: "history", onSelect: history },
      { title: "Модели и пулы", value: "models", onSelect: () => void execute("lead-models") },
      { title: "Настройки", value: "settings", onSelect: () => void execute("lead-settings") },
      { title: "Диагностика", value: "doctor", onSelect: () => void execute("lead-doctor") },
    ]} />)
  }

  api.keymap.registerLayer({ commands: [
    { name: "teamlead.menu", title: "TeamLead: Открыть меню", category: "TeamLead", namespace: "palette", run: menu },
    { name: "teamlead.status", title: "TeamLead: Текущий запуск", category: "TeamLead", namespace: "palette", run: details },
    { name: "teamlead.execute", title: "TeamLead: Запустить задачу", category: "TeamLead", namespace: "palette", run: () => prompt("Задача TeamLead", "lead") },
  ] })
  api.slots.register({ slots: {
    session_prompt_right(_ctx, props) {
      return <text onMouseDown={menu} fg={api.theme.current.textMuted}>{formatIndicator(current(props.session_id), !wide())}</text>
    },
    home_prompt_right() { return <text onMouseDown={menu} fg={api.theme.current.textMuted}>{formatIndicator(current(), !wide())}</text> },
  } })
  const poll = setInterval(() => { setWide(api.renderer.width >= 100); void refresh() }, 1500)
  api.lifecycle.onDispose(() => clearInterval(poll))
  void refresh()
}

export default { id: "teamlead.tui", tui } satisfies TuiPluginModule
