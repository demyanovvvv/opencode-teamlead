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
  const [language, setLanguage] = createSignal<"en" | "ru">("en")
  const directory = api.state.path.worktree || api.state.path.directory
  const root = directory.replace(/[\\/]$/, "")
  const installedLanguage = path.join(import.meta.dirname, "language.json")

  async function refresh() {
    try {
      const current = JSON.parse(await fs.readFile(path.join(root, ".opencode", ".teamlead", "presentation.json"), "utf8")) as Summary[]
      if (Array.isArray(current)) setRuns(current.filter((item) => item && typeof item.id === "string"))
    } catch { /* No TeamLead run yet. */ }
    try {
      const preference = JSON.parse(await fs.readFile(installedLanguage, "utf8")) as { language?: string }
      setLanguage(preference.language === "ru" ? "ru" : "en")
    } catch { setLanguage("en") }
    try {
      const config = JSON.parse(await fs.readFile(path.join(root, ".opencode", "teamlead.json"), "utf8")) as { language?: string }
      if (config.language === "en" || config.language === "ru") setLanguage(config.language)
    } catch { /* Global installation may have no project config. */ }
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
       api.ui.toast({ variant: "info", message: language() === "ru" ? "Откройте сессию OpenCode" : "Open an OpenCode session first" })
      return
    }
    try {
      const result = await api.client.session.command({ sessionID: route.params.sessionID, directory, command: name, arguments: args })
      if (result.error) api.ui.toast({ variant: "error", message: language() === "ru" ? `Не удалось запустить /${name}` : `Could not run /${name}` })
    } catch { api.ui.toast({ variant: "error", message: language() === "ru" ? `Не удалось запустить /${name}` : `Could not run /${name}` }) }
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
         ? `${formatIndicator(selected, false, language())}\n${selected.goal}\nID: ${selected.id}\n` +
           `${language() === "ru" ? "Оценка" : "Estimate"}: ${selected.estimatedTokens} tokens, $${selected.estimatedCostUsd.toFixed(4)}\n` +
          selected.tasks.map((task) => `${task.status}: ${task.id}${task.model ? ` (${task.model})` : ""}`).join("\n") +
          (selected.error ? `\nОшибка: ${selected.error}` : "")
         : language() === "ru" ? "Запусков TeamLead пока нет" : "No TeamLead runs yet"
       api.ui.dialog.replace(() => <api.ui.DialogAlert title="TeamLead" message={message} />)
    })
  }

  function history() {
    void refresh().then(() => api.ui.dialog.replace(() => <api.ui.DialogSelect title={language() === "ru" ? "Запуски TeamLead" : "TeamLead runs"} options={runs().map((run) => ({
      title: `${run.status} · ${run.goal.slice(0, 55)}`,
       description: `${run.id} · ${run.completed}/${run.total}`,
      value: run.id,
       onSelect: () => api.ui.dialog.replace(() => <api.ui.DialogAlert title={`TeamLead ${run.id}`} message={`${formatIndicator(run, false, language())}\n${run.goal}\n${run.tasks.map((task) => `${task.status}: ${task.id}`).join("\n")}`} />),
    }))} />))
  }

  function menu() {
    const ru = language() === "ru"
    api.ui.dialog.replace(() => <api.ui.DialogSelect title="TeamLead" options={[
      { title: ru ? "Текущий запуск" : "Current run", value: "status", onSelect: details },
      { title: ru ? "Запустить задачу…" : "Run task…", value: "execute", onSelect: () => prompt(ru ? "Задача TeamLead" : "TeamLead task", "lead") },
      { title: ru ? "Предварительный план…" : "Plan task…", value: "plan", onSelect: () => prompt(ru ? "План TeamLead" : "TeamLead plan", "lead-plan") },
      { title: ru ? "Продолжить запуск" : "Resume run", value: "resume", disabled: !runs().some((run) => ["planned", "repair_required"].includes(run.status) || run.interrupted), onSelect: () => void execute("lead-resume") },
      { title: ru ? "История запусков" : "Run history", value: "history", onSelect: history },
      { title: ru ? "Модели и пулы" : "Models & pools", value: "models", onSelect: () => void execute("lead-models") },
      { title: ru ? "Настройки" : "Settings", value: "settings", onSelect: () => void execute("lead-settings") },
      { title: ru ? "Диагностика" : "Diagnostics", value: "doctor", onSelect: () => void execute("lead-doctor") },
    ]} />)
  }

  api.keymap.registerLayer({ commands: [
    { name: "teamlead.menu", title: "TeamLead: Open menu", category: "TeamLead", namespace: "palette", run: menu },
    { name: "teamlead.status", title: "TeamLead: Current run", category: "TeamLead", namespace: "palette", run: details },
    { name: "teamlead.execute", title: "TeamLead: Run task", category: "TeamLead", namespace: "palette", run: () => prompt("TeamLead task", "lead") },
  ] })
  api.slots.register({ slots: {
    session_prompt_right(_ctx, props) {
      return <text onMouseUp={menu} fg={api.theme.current.textMuted}>{formatIndicator(current(props.session_id), !wide(), language())}</text>
    },
    home_prompt_right() { return <text onMouseUp={menu} fg={api.theme.current.textMuted}>{formatIndicator(current(), !wide(), language())}</text> },
  } })
  const poll = setInterval(() => { setWide(api.renderer.width >= 100); void refresh() }, 1500)
  api.lifecycle.onDispose(() => clearInterval(poll))
  void refresh()
}

export default { id: "teamlead.tui", tui } satisfies TuiPluginModule
