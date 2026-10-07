window.__ModuleLoader__.load({
	id: "dsh-groupchat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
		const {
			useEffect, useRef, useState, useSyncExternalStore, useMemo, useCallback, useLayoutEffect,
		} = React;
		const h = React.createElement;

        const DIAGNOSTIC_KEY = "dsh-groupchat:diagnostics";
        const bootLog = [];
        const recordDiagnostic = (event, data = {}) => {
            bootLog.push({ version: "1.1.0-beta.8", time: new Date().toISOString(), event, ...data });
            if (bootLog.length > 160) bootLog.splice(0, bootLog.length - 160);
            try { window.localStorage?.setItem(DIAGNOSTIC_KEY, JSON.stringify(bootLog)); } catch {}
        };
        try {
            const previous = JSON.parse(window.localStorage?.getItem(DIAGNOSTIC_KEY) ?? "[]");
            if (Array.isArray(previous)) bootLog.push(...previous.slice(-100));
        } catch {}
        const safeError = (error) => ({
            name: error?.name ?? "Error",
            category: String(error?.message ?? "").match(/^(?:Cannot (?:read|set) properties of (?:undefined|null)|Maximum update depth exceeded|Too many re-renders|Rendered (?:more|fewer) hooks|conversation view target "group-chat" is already registered)/)?.[0] ?? "unclassified",
            // Error messages can contain prompts or credentials: only code-location frames are retained.
            frames: String(error?.stack ?? "").split("\n").filter(line => /^\s*at /.test(line)).slice(0, 8).map(line => line.replace(/\?([^\s)]*)/g, (_, tail) => "?redacted" + (tail.match(/:\d+:\d+$/)?.[0] ?? "")).slice(0, 240)),
        });
        const saveDiagnostic = (payload) => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = "dsh-groupchat-beta8-diagnostics.json";
            link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        window.__DSH_GROUPCHAT_DIAGNOSTICS__ = {
            download: () => downloadDiagnostics(document.querySelector(".gc-view"), store.getSnapshot().viewSessionId),
        };
        recordDiagnostic("bundle-factory-loaded");

		// ---------------------------------------------------------------------
		// locale
		// ---------------------------------------------------------------------
		const NS = "groupchat";
		const zh = {
			"view.title": "群聊",
			"view.loading": "正在加载群聊…",
			"view.empty": "还没有群聊，点击「新建群聊」开始",
			"view.noMembers": "群内还没有 AI 成员，点击「成员」添加",
			"view.connectionLost": "与宿主的实时连接已断开",
			"group.new": "新建群聊",
			"group.rename": "重命名",
			"group.delete": "删除群聊",
			"group.deleteConfirm": "确定删除该群聊？聊天记录将一并删除。",
			"group.namePlaceholder": "群聊名称",
			"member.add": "添加成员",
			"member.edit": "编辑成员",
			"member.remove": "移除",
			"member.name": "名字",
			"member.avatar": "头像",
			"member.color": "标识色",
			"member.persona": "性格设定",
			"member.personaPlaceholder": "例如：严谨的软件架构师，说话简洁，喜欢先列要点再展开…",
			"member.provider": "API 提供商",
			"member.model": "模型",
			"member.reasoning": "推理强度",
			"member.reasoningDefault": "默认",
			"member.temperature": "温度",
			"member.maxTokens": "最大输出",
			"member.enabled": "启用该成员",
			"member.save": "保存",
			"member.cancel": "取消",
			"member.providerFailed": "{name}：{message}",
			"tasks.title": "共享任务",
			"tasks.addPlaceholder": "新任务标题",
			"tasks.add": "添加",
			"tasks.empty": "暂无任务，@成员一起完成任务吧",
			"tasks.status.pending": "待处理",
			"tasks.status.in_progress": "进行中",
			"tasks.status.completed": "已完成",
			"tasks.assignee": "负责人",
			"tasks.none": "未分配",
			"tasks.remove": "删除",
			"memory.title": "共享记忆",
			"memory.placeholder": "记录群成员可以共同读取的记忆，例如项目背景、约定、已完成的工作…",
			"memory.save": "保存记忆",
			"memory.saved": "已保存",
			"memory.hint": "记忆会注入每个成员的上下文",
			"composer.placeholder": "输入消息，@成员 邀请 TA 发言…",
			"composer.send": "发送",
			"composer.stop": "停止",
			"composer.mentionAll": "所有人",
			"user.name": "我",
			"busy.replying": "正在回复",
			"busy.queued": "排队中",
			"system.error": "错误",
			"panel.members": "成员",
			"panel.tasks": "任务",
			"panel.memory": "记忆",
			"panel.close": "收起",
			"time.justNow": "刚刚",
			"actions.rename": "重命名",
			"actions.delete": "删除",
			"actions.clear": "清空消息",
			"streaming": "正在输入…",
		};
		const en = {
			"view.title": "Group Chat",
			"view.loading": "Loading group chat…",
			"view.empty": "No groups yet — create one to start",
			"view.noMembers": "No AI members yet — open Members to add",
			"view.connectionLost": "Live connection to the host was lost",
			"group.new": "New group",
			"group.rename": "Rename",
			"group.delete": "Delete group",
			"group.deleteConfirm": "Delete this group and all of its messages?",
			"group.namePlaceholder": "Group name",
			"member.add": "Add member",
			"member.edit": "Edit member",
			"member.remove": "Remove",
			"member.name": "Name",
			"member.avatar": "Avatar",
			"member.color": "Accent",
			"member.persona": "Personality",
			"member.personaPlaceholder": "e.g. A rigorous software architect who speaks concisely and prefers bullet points…",
			"member.provider": "API Provider",
			"member.model": "Model",
			"member.reasoning": "Reasoning effort",
			"member.reasoningDefault": "Default",
			"member.temperature": "Temperature",
			"member.maxTokens": "Max tokens",
			"member.enabled": "Enable this member",
			"member.save": "Save",
			"member.cancel": "Cancel",
			"member.providerFailed": "{name}: {message}",
			"tasks.title": "Shared tasks",
			"tasks.addPlaceholder": "New task title",
			"tasks.add": "Add",
			"tasks.empty": "No tasks yet — @ members to work together",
			"tasks.status.pending": "Pending",
			"tasks.status.in_progress": "In progress",
			"tasks.status.completed": "Completed",
			"tasks.assignee": "Assignee",
			"tasks.none": "Unassigned",
			"tasks.remove": "Delete",
			"memory.title": "Shared memory",
			"memory.placeholder": "Notes every member can read: project background, conventions, finished work…",
			"memory.save": "Save memory",
			"memory.saved": "Saved",
			"memory.hint": "Memory is injected into every member's context",
			"composer.placeholder": "Type a message, @member to invite them…",
			"composer.send": "Send",
			"composer.stop": "Stop",
			"composer.mentionAll": "Everyone",
			"user.name": "Me",
			"busy.replying": "replying",
			"busy.queued": "queued",
			"system.error": "Error",
			"panel.members": "Members",
			"panel.tasks": "Tasks",
			"panel.memory": "Memory",
			"panel.close": "Close",
			"time.justNow": "just now",
			"actions.rename": "Rename",
			"actions.delete": "Delete",
			"actions.clear": "Clear messages",
			"streaming": "typing…",
		};

		// ---------------------------------------------------------------------
		// small utilities
		// ---------------------------------------------------------------------
		function tpl(t, params) {
			return t.replace(/\{(\w+)\}/g, (_, key) => (params && key in params ? String(params[key]) : `{${key}}`));
		}
		function fmtTime(ts) {
			const date = new Date(ts);
			const pad = (value) => String(value).padStart(2, "0");
			return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function now() {
			return Date.now();
		}
		function uid() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
		}

		// ---------------------------------------------------------------------
		// module store
		// ---------------------------------------------------------------------
		const UI_DEFAULTS = { importMode: "ask", bubbleOpacity: 100, userColor: "#456de3", randomColors: true, defaultWorkMode: false, includeMain: false, enterToSend: true, panelWidth: 320, allowAgentManagement: false };
        const MEMBER_COLORS = ["#456de3", "#8b5cf6", "#0891b2", "#059669", "#d97706", "#db2777", "#dc4c42", "#64748b"];
        function readPreferences() {
            try { const saved = JSON.parse(localStorage.getItem("dsh-groupchat:preferences") || "{}");
                return { ...UI_DEFAULTS, ...saved, importMode: localStorage.getItem("dsh-groupchat:import-preference") || saved.importMode || "ask" };
            } catch { return { ...UI_DEFAULTS }; }
        }
        function savePreferences(value) {
            const prefs = { ...UI_DEFAULTS, ...value, bubbleOpacity: Math.max(20, Math.min(100, Number(value.bubbleOpacity) || 100)), panelWidth: Math.max(240, Math.min(600, Number(value.panelWidth) || 320)) };
            try { localStorage.setItem("dsh-groupchat:preferences", JSON.stringify(prefs)); localStorage.setItem("dsh-groupchat:import-preference", prefs.importMode); localStorage.setItem("dsh-groupchat:panel-width", String(prefs.panelWidth)); }
            catch { throw new Error("当前客户端不能保存全局设置"); }
            store.update(draft => { draft.preferences = prefs; });
        }
        function newMemberColor(group) {
            if (!store.getSnapshot().preferences.randomColors) return MEMBER_COLORS[0];
            const available = MEMBER_COLORS.filter(color => !group.members.some(member => member.color === color));
            const choices = available.length ? available : MEMBER_COLORS;
            return choices[Math.floor(Math.random() * choices.length)];
        }
        const INITIAL_STATE = () => ({
            preferences: readPreferences(),
			groups: [],
			catalog: null,
			activeGroupId: null,
            viewSessionId: null,
			loadStatus: "idle", // idle | loading | ready | error
			catalogError: null,
			modelSourceRevision: 0,
			drafts: {},
			busy: false,
			responders: [],
			typing: [],
			connected: false,
			error: null,
			panel: null,
			editor: null, // { memberId?: string } | null — member editor modal
			confirm: null, // { text, onOk } | null
		});
		const store = createSnapshotStore(INITIAL_STATE());
		const ABSENT_MODEL_SOURCE = { getSnapshot: () => null, subscribe: () => () => {} };
		function mainSelectionOf(snapshot) {
			const selected = snapshot?.current ?? snapshot?.next ?? snapshot?.lastUsed;
			return selected && typeof selected.provider === "string" && selected.provider && typeof selected.model === "string" && selected.model
				? { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}) } : null;
		}

		function useStore(selector) {
			const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
			return selector ? selector(snapshot) : snapshot;
		}

		function groupOf(state, groupId) {
			return state.groups.find((group) => group.id === groupId);
		}
		function activeGroup(state) {
			if (state.viewSessionId !== null) return state.groups.find((group) => group.hostSessionId === state.viewSessionId);
            return groupOf(state, state.activeGroupId) ?? state.groups[0];
		}
		function memberOf(group, memberId) {
			return group?.members.find((member) => member.id === memberId);
		}

		function upsertMessage(group, message) {
			const index = group.messages.findIndex((candidate) => candidate.id === message.id);
			if (index >= 0) group.messages[index] = message;
			else group.messages.push(message);
			return message;
		}
		function mergeCommandGroup(previous, incoming) {
			if (!previous) return incoming;
			const messages = incoming.messages.map((message) => {
				const current = previous.messages.find((item) => item.id === message.id);
				if (message.status === "streaming" && current && (current.status !== "streaming" || current.text.length > message.text.length)) return current;
				return message;
			});
			for (const message of previous.messages) if (message.seq > incoming.seq && !messages.some((item) => item.id === message.id)) messages.push(message);
			return { ...incoming, messages, seq: Math.max(previous.seq, incoming.seq) };
		}

		function applyFrame(frame) {
            if (frame.type === "turn") recordDiagnostic("turn-routing", { groupId: frame.groupId, running: frame.running, responderIds: frame.responders ?? [] });

			if (frame.groupId === void 0) return;
			store.update((draft) => {
				const group = groupOf(draft, frame.groupId);
				switch (frame.type) {
					case "snapshot":
						if (group === void 0) draft.groups.push(frame.group);
						else draft.groups[draft.groups.indexOf(group)] = frame.group;
						draft.connected = true;
						if (frame.groupId === draft.activeGroupId) {
							draft.busy = frame.group.runtime?.running ?? false;
							draft.responders = frame.group.runtime?.responders ?? [];
							draft.typing = frame.group.runtime?.typing ?? [];
						}
						return;
					case "group":
						if (group !== void 0) draft.groups[draft.groups.indexOf(group)] = frame.group;
						draft.connected = true;
						return;
					case "message": {
						if (group === void 0) return;
						upsertMessage(group, frame.message);
						return;
					}
					case "message-create": {
						if (group === void 0) return;
						const index = group.messages.findIndex((candidate) => candidate.id === frame.message.id);
						if (index >= 0) return;
						group.messages.push({ ...frame.message, status: "streaming" });
						return;
					}
					case "delta": {
						if (group === void 0) return;
						const message = group.messages.find((candidate) => candidate.id === frame.messageId);
						if (message !== void 0) message.text += frame.text;
						return;
					}
					case "typing": {
						if (frame.groupId !== draft.activeGroupId) return;
						if (frame.on) {
							if (!draft.typing.includes(frame.memberId)) draft.typing.push(frame.memberId);
						} else {
							draft.typing = draft.typing.filter((id) => id !== frame.memberId);
						}
						return;
					}
					case "turn": {
						if (frame.groupId !== draft.activeGroupId) return;
						draft.busy = frame.running;
						draft.responders = frame.responders ?? [];
						return;
					}
					case "error":
						draft.error = frame.text;
						return;
				}
			});
		}

		// ---------------------------------------------------------------------
		// host API client
		// ---------------------------------------------------------------------
		function createApi(storeRef) {
			let eventsAbort = null;
			let eventsGroupId = null;

			let refreshFlight = null;
			let catalogFlight = null;
			let disposed = false;
			const requests = new Set();
			async function fetchJson(route, options = {}) {
				const abort = new AbortController();
				requests.add(abort);
				const timeout = setTimeout(() => abort.abort(), 15000);
				try {
					const response = await fetch(route, { ...options, signal: abort.signal, cache: "no-store" });
					let value;
					const bodyText = await response.text();
                    try { value = JSON.parse(bodyText); } catch { throw new Error(`HTTP ${response.status}: ${bodyText.slice(0, 800) || "响应为空"}`); }
                    if (!response.ok || value.ok === false) throw new Error(typeof value.error === "string" ? value.error : value.error?.message ?? `HTTP ${response.status}`);
					if (disposed) throw new Error("插件已卸载");
					return value;
				} catch (error) {
					if (abort.signal.aborted && !disposed) throw new Error("请求超时，请检查连接后重试");
					throw error;
				} finally { clearTimeout(timeout); requests.delete(abort); }
			}
			function refreshCatalog() {
				if (catalogFlight) return catalogFlight;
				catalogFlight = fetchJson("/groupchat/catalog").then((value) => {
					storeRef.update((draft) => {
						draft.catalog = { groups: value.groups ?? [], failures: value.failures ?? [] };
						draft.catalogError = null;
					});
					return storeRef.getSnapshot().catalog;
				}).catch((error) => {
					if (!disposed) storeRef.update((draft) => { draft.catalogError = error.message; });
					return null;
				}).finally(() => { catalogFlight = null; });
				return catalogFlight;
			}
			function refresh() {
				if (refreshFlight) return refreshFlight;
				storeRef.update((draft) => { draft.loadStatus = "loading"; });
				refreshFlight = fetchJson("/groupchat/state").then((value) => {
					if (!Array.isArray(value.groups)) throw new Error("群聊状态格式错误");
					storeRef.update((draft) => {
						draft.groups = value.groups;
						if (!draft.groups.some((group) => group.id === draft.activeGroupId)) draft.activeGroupId = (draft.viewSessionId === null ? draft.groups[0] : draft.groups.find((g) => g.hostSessionId === draft.viewSessionId))?.id ?? null;
						draft.loadStatus = "ready";
						draft.error = null;
					});
					return value.groups;
				}).catch((error) => {
					if (!disposed) storeRef.update((draft) => { draft.loadStatus = "error"; draft.error = error.message; });
					throw error; // Never treat a failed read as an empty database.
				}).finally(() => { refreshFlight = null; });
				return refreshFlight;
			}
			let defaultFlight = null;
			function ensureDefaultGroup() {
				if (defaultFlight) return defaultFlight;
				defaultFlight = (async () => {
					const state = storeRef.getSnapshot();
					if (state.loadStatus !== "ready" || state.groups.length > 0) return;
					// Create an editable empty group immediately. Model discovery must not block the UI.
					const { group } = await command({ op: "createGroup", name: "默认群聊" });
					void refreshCatalog();

				})().finally(() => { defaultFlight = null; });
				return defaultFlight;
			}

            const sessionFlights = new Map();
            function ensureSessionGroup(sessionId, name) {
                if (!sessionId) return Promise.reject(new Error("尚未绑定宿主对话"));
                const current = storeRef.getSnapshot(), known = current.groups.find((g) => g.hostSessionId === sessionId);
                const select = (group) => { if (storeRef.getSnapshot().viewSessionId === sessionId) storeRef.update((draft) => { draft.activeGroupId = group.id; }); return group; };
                if (known) return Promise.resolve(select(known));
                if (sessionFlights.has(sessionId)) return sessionFlights.get(sessionId);
                const legacyGroupId = current.groups.find((g) => !g.hostSessionId)?.id;
                const flight = command({ op: "ensureSessionGroup", sessionId, legacyGroupId, name, workMode: storeRef.getSnapshot().preferences.defaultWorkMode, allowAgentManagement: storeRef.getSnapshot().preferences.allowAgentManagement }).then((result) => select(result.group)).finally(() => sessionFlights.delete(sessionId));
                sessionFlights.set(sessionId, flight); return flight;
            }

			const memberFlights = new Map();
			function ensureGroupMember(groupId, selection) {
				const group = groupOf(storeRef.getSnapshot(), groupId);
				if (!group || group.members.length > 0) return Promise.resolve();
				if (!selection) return Promise.reject(new Error("尚未读取到主对话的 API / 模型，请等待加载或在成员面板手动选择"));
				if (memberFlights.has(groupId)) return memberFlights.get(groupId);
				const flight = command({ op: "ensureDefaultMember", groupId, selection }).finally(() => memberFlights.delete(groupId));
				memberFlights.set(groupId, flight);
				return flight;
			}

			async function command(body) {
				const response = await fetchJson("/groupchat/command", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}).catch((error) => {
					if (!disposed) storeRef.update((draft) => { draft.error = error.message; });
					throw error;
				});
				if (!response.ok) throw new Error(response.error ?? "操作失败");
				// 命令响应携带最新群快照时直接落库，SSE 广播兜底
				if (response.group !== void 0 && typeof response.group.id === "string") {
					store.update((draft) => {
						const index = draft.groups.findIndex((group) => group.id === response.group.id);
						if (index >= 0) draft.groups[index] = body.op === "clearMessages" ? response.group : mergeCommandGroup(draft.groups[index], response.group);
						else draft.groups.push(response.group);
						if (draft.activeGroupId === null && draft.viewSessionId === null && draft.groups.length > 0) draft.activeGroupId = draft.groups[0].id;
					});
				}
				return response;
			}

			async function sendMessage(groupId, text, selection, workMode = false) {
				await ensureGroupMember(groupId, selection);
				// The host acknowledges immediately; no optimistic duplicate or phantom history.
				return await command({ op: workMode ? "planTasks" : "sendMessage", groupId, text });
			}

			function openEvents(groupId) {
				if (eventsAbort) eventsAbort.abort();
				const abort = new AbortController();
				eventsAbort = abort;
				eventsGroupId = groupId;
				let retryTimer = null;
				let reader = null;
				let idleTimer = null;
				let attempt = 0;
				const run = async () => {
					try {
						const response = await fetch(`/groupchat/events?groupId=${encodeURIComponent(groupId)}`, { signal: abort.signal, cache: "no-store" });
						if (!response.ok || !response.body) throw new Error(`events HTTP ${response.status}`);
						if (abort.signal.aborted) return;
						reader = response.body.getReader();
						const decoder = new TextDecoder();
						let buffer = "";
						for (;;) {
							// Heartbeats normally arrive every 15s. Reopen stalled connections.
							idleTimer = setTimeout(() => { void reader?.cancel(); }, 45000);
							const { done, value } = await reader.read();
							clearTimeout(idleTimer);
							if (done || abort.signal.aborted) break;
							attempt = 0;
							buffer += decoder.decode(value, { stream: true });
							let match;
							while ((match = /\r?\n\r?\n/.exec(buffer)) !== null) {
								const chunk = buffer.slice(0, match.index);
								buffer = buffer.slice(match.index + match[0].length);
								const data = chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n");
								if (!data) continue;
								let frame;
								try { frame = JSON.parse(data); } catch { continue; }
								if (!abort.signal.aborted && frame.groupId === groupId) applyFrame(frame);
							}
							if (buffer.length > 1024 * 1024) throw new Error("事件数据过大");
						}
					} catch (error) {
						// Reconnect on network errors and normal EOF alike.
					} finally {
						clearTimeout(idleTimer);
						if (reader) { try { await reader.cancel(); } catch {} reader = null; }
					}
					if (abort.signal.aborted || disposed) return;
					storeRef.update((draft) => { draft.connected = false; });
					retryTimer = setTimeout(() => { void run(); }, Math.min(1000 * 2 ** attempt++, 10000));
				};
				void run();
				return () => {
					abort.abort(); clearTimeout(retryTimer); clearTimeout(idleTimer);
					if (reader) void reader.cancel().catch(() => {});
					if (eventsAbort === abort) { eventsAbort = null; eventsGroupId = null; }
				};
			}
			function dispose() {
				disposed = true;
				eventsAbort?.abort();
				for (const abort of requests) abort.abort();
			}
			return { refresh, refreshCatalog, ensureDefaultGroup, ensureSessionGroup, ensureGroupMember, command, sendMessage, openEvents, dispose };

		}

		// ---------------------------------------------------------------------
		// shared presentational pieces
		// ---------------------------------------------------------------------
		function Avatar({ member, size }) {
			const style = {
				width: size,
				height: size,
				background: member.color ?? "#4d7bfe",
			};
			const isImage = /^(https?:\/\/|data:image\/)/i.test(member.avatar ?? "");
			return h("span", { className: "gc-avatar", style }, isImage
				? h("img", { src: member.avatar, alt: member.name, draggable: false })
				: h("span", { className: "gc-avatar-emoji" }, member.avatar ?? "🤖"));
		}

		function MentionedText({ text, members, t }) {
			const parts = useMemo(() => {
				if (members.length === 0) return null;
				const names = members.map((member) => member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
				if (names.length === 0) return null;
				const pattern = new RegExp(`(@${names.join("|@")})(?=[\\s,，、:：。！？!?]|$)`, "giu");
				const segments = [];
				let last = 0;
				for (const match of text.matchAll(pattern)) {
					if (match.index > last) segments.push({ text: text.slice(last, match.index), mention: false });
					segments.push({ text: match[0], mention: true });
					last = match.index + match[0].length;
				}
				if (last < text.length) segments.push({ text: text.slice(last), mention: false });
				return segments;
			}, [text, members]);
			if (parts === null) return h("span", null, text);
			return h(
				"span",
				null,
				parts.map((part, index) => part.mention
					? h("span", { key: index, className: "gc-mention" }, part.text)
					: h(React.Fragment, { key: index }, part.text))
			);
		}

		function Modal({ title, onClose, children, width }) {
			useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [onClose]);
			return h("div", { className: "gc-modal-backdrop", onMouseDown: (event) => {
				if (event.target === event.currentTarget) onClose();
			} }, h("div", { className: "gc-modal", role: "dialog", "aria-modal": true, "aria-label": title, style: { width: width ?? 460 } }, [
				h("div", { className: "gc-modal-head" }, [
					h("div", { className: "gc-modal-title" }, title),
					h("button", { type: "button", className: "gc-icon-btn", onClick: onClose, "aria-label": "close" }, "✕"),
				]),
				h("div", { className: "gc-modal-body" }, children),
			]));
		}

		function ConfirmDialog({ text, onOk, onCancel, t }) {
			return h(Modal, { title: t("group.delete"), onClose: onCancel, width: 360 }, [
				h("p", { className: "gc-confirm-text" }, text),
				h("div", { className: "gc-row gc-row-end" }, [
					h("button", { type: "button", className: "gc-btn", onClick: onCancel }, t("member.cancel")),
					h("button", { type: "button", className: "gc-btn gc-btn-danger", onClick: onOk }, t("group.delete")),
				]),
			]);
		}

		// ---------------------------------------------------------------------
		// member editor
		// ---------------------------------------------------------------------
		const AVATAR_PRESETS = ["🤖", "😊", "🧠", "🦊", "🐱", "🐶", "🦉", "🐼", "🤓", "😎", "🧙", "🦄", "🐳", "🌙", "⚡", "🎯"];

		function MemberEditor({ group, member, catalog, t, api, onClose }) {
			const [form, setForm] = useState(() => ({
				name: member?.name ?? "",
                parentId: member?.parentId ?? "", permission: member?.permission ?? "full",
				avatar: member?.avatar ?? "🤖",
				color: member?.color ?? newMemberColor(group),
				persona: member?.persona ?? "",
                routingKeywords: member?.routingKeywords ?? "",
				provider: member?.provider ?? catalog.groups[0]?.id ?? "",
				model: member?.model ?? "",
				reasoningEffort: member?.reasoningEffort ?? "",
				temperature: member?.temperature === void 0 ? "" : String(member.temperature),
				maxTokens: member?.maxTokens === void 0 ? "" : String(member.maxTokens),
				enabled: member?.enabled ?? true,
			}));
			useEffect(() => {
				setForm((current) => {
					const provider = catalog.groups.find((item) => item.id === current.provider) ?? (current.provider === "" ? catalog.groups[0] : null);
					return provider ? { ...current, provider: provider.id, model: current.model || provider.models[0]?.id || "" } : current;
				});
			}, [catalog]);
			const [saving, setSaving] = useState(false);
            const [testing, setTesting] = useState(false), [connection, setConnection] = useState(member?.connection ?? null);
            const testGeneration = useRef(0);
            useEffect(() => { testGeneration.current++; setConnection(null); }, [form.provider, form.model, form.reasoningEffort]);
            useEffect(() => () => { testGeneration.current++; }, []);
            const testConnection = async () => {
                const generation = testGeneration.current; setTesting(true); setError(null);
                try {
                    const result = await api.command({ op: "testConnection", groupId: group.id, member: { id: member?.id, name: form.name, provider: form.provider, model: form.model, reasoningEffort: form.reasoningEffort } });
                    if (generation === testGeneration.current) setConnection(result.connection);
                } catch (e) { if (generation === testGeneration.current) { setError(e.message); setConnection({ state: "error", error: e.message }); } }
                finally { setTesting(false); }
            };
			const [error, setError] = useState(null);
			const provider = catalog.groups.find((groupItem) => groupItem.id === form.provider);
			const modelInfo = provider?.models.find((model) => model.id === form.model);
			const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

			const onProviderChange = (value) => {
				const next = catalog.groups.find((groupItem) => groupItem.id === value);
				patch("provider", value);
				patch("model", next?.models[0]?.id ?? "");
				patch("reasoningEffort", "");
			};

			const save = async () => {
				if (form.name.trim() === "") {
					setError(t("member.name") + " 必填");
					return;
				}
				if (form.provider === "" || form.model === "") {
					setError("请选择 API 提供商与模型");
					return;
				}
				setSaving(true);
				setError(null);
				try {
					const payload = {
						id: member?.id,
						name: form.name.trim(),
                        parentId: form.parentId, permission: form.permission,
						avatar: form.avatar.trim() || "🤖",
						color: form.color || "#4d7bfe",
						persona: form.persona,
                        routingKeywords: form.routingKeywords,
                        connection: connection?.state === "connected" ? connection : undefined,
						provider: form.provider,
						model: form.model,
						reasoningEffort: form.reasoningEffort === "" ? undefined : form.reasoningEffort,
						temperature: form.temperature === "" ? undefined : Number(form.temperature),
						maxTokens: form.maxTokens === "" ? undefined : Number(form.maxTokens),
						enabled: form.enabled,
					};
					const result = await api.command(member === void 0
						? { op: "addMember", groupId: group.id, member: payload }
						: { op: "updateMember", groupId: group.id, member: payload });
					if (!result.ok) throw new Error(result.error ?? "保存失败");
					onClose();
				} catch (saveError) {
					setError(saveError instanceof Error ? saveError.message : String(saveError));
					setSaving(false);
				}
			};

			return h(Modal, { title: member === void 0 ? t("member.add") : t("member.edit"), onClose, width: 520 }, [
				h("div", { className: "gc-form" }, [
					h("label", { className: "gc-field" }, [
						h("span", { className: "gc-field-label" }, t("member.name")),
						h("input", { className: "gc-input", value: form.name, maxLength: 24, onChange: (event) => patch("name", event.target.value), placeholder: "e.g. 架构师" }),
					]),
					h("label", { className: "gc-field" }, [
						h("span", { className: "gc-field-label" }, t("member.avatar")),
						h("div", { className: "gc-avatar-row" }, [
							h("div", { className: "gc-avatar-current" }, [
								Avatar({ member: { name: form.name || "?", avatar: form.avatar, color: form.color }, size: 40 }),
							]),
							h("div", { className: "gc-avatar-presets" }, AVATAR_PRESETS.map((emoji) => h("button", {
								key: emoji, type: "button",
								className: form.avatar === emoji ? "gc-avatar-preset gc-avatar-preset-active" : "gc-avatar-preset",
								onClick: () => patch("avatar", emoji),
							}, emoji))),
							h("div", { className: "gc-avatar-upload-row" }, [
								h("input", { className: "gc-input gc-input-avatar", value: /^(https?:\/\/|data:image\/)/i.test(form.avatar) ? form.avatar : "", placeholder: "图片 URL 或上传", onChange: (event) => patch("avatar", event.target.value) }),
								h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => document.getElementById("gc-avatar-file")?.click() }, "上传"),
								h("input", {
									id: "gc-avatar-file", type: "file", accept: "image/*", style: { display: "none" },
									onChange: (event) => {
										const file = event.target.files?.[0];
										if (file === void 0) return;
										const reader = new FileReader();
										reader.onload = () => {
											const raw = reader.result;
											if (typeof raw !== "string") return;
											const img = new Image();
											img.onload = () => {
												const size = 128;
												const scale = Math.min(1, size / Math.max(img.width, img.height));
												const canvas = document.createElement("canvas");
												canvas.width = Math.max(1, Math.round(img.width * scale));
												canvas.height = Math.max(1, Math.round(img.height * scale));
												const context = canvas.getContext("2d");
												if (context === null) {
													patch("avatar", raw);
													return;
												}
												context.drawImage(img, 0, 0, canvas.width, canvas.height);
												try {
													patch("avatar", canvas.toDataURL("image/png"));
												} catch {
													patch("avatar", raw);
												}
											};
											img.onerror = () => patch("avatar", raw);
											img.src = raw;
										};
										reader.readAsDataURL(file);
										event.target.value = "";
									},
								}),
							]),
						]),
					]),
					h("label", { className: "gc-field" }, [
						h("span", { className: "gc-field-label" }, t("member.color")),
						h("input", { className: "gc-input gc-input-color", type: "color", value: form.color, onChange: (event) => patch("color", event.target.value) }),
					]),
					h("label", { className: "gc-field" }, [
						h("span", { className: "gc-field-label" }, "上级成员"),
                        h("select", { className: "gc-input", value: form.parentId, onChange: (event) => patch("parentId", event.target.value) }, [h("option", { value: "" }, "无上级 / 协调者"), ...group.members.filter((m) => m.id !== member?.id).map((m) => h("option", { key: m.id, value: m.id }, m.name))]),
                        h("span", { className: "gc-field-label" }, "协作权限"),
                        h("select", { className: "gc-input", value: form.permission, onChange: (event) => patch("permission", event.target.value) }, [h("option", { value: "read_only" }, "只读 · 分析回复，不自动派发"), h("option", { value: "approval" }, "审批 · 任务执行/接力须审批"), h("option", { value: "full" }, "完全访问 · 自动文字协作")]),
                        h("small", { className: "gc-memory-hint" }, "权限用于本插件的任务/调用流程，尚未接入文件或终端工具。"),
                        h("span", { className: "gc-field-label" }, t("member.persona")),
						h("textarea", { className: "gc-input gc-textarea", rows: 4, value: form.persona, maxLength: 2000, placeholder: t("member.personaPlaceholder"), onChange: (event) => patch("persona", event.target.value) }),
                        h("span", { className: "gc-field-label" }, "负责主题关键词（逗号分隔）"),
                        h("input", { className: "gc-input", value: form.routingKeywords, maxLength: 500, placeholder: "例如：GCr15，热处理，材料分析", onChange: (event) => patch("routingKeywords", event.target.value) }),
					]),
					h("div", { className: "gc-form-grid" }, [
						h("label", { className: "gc-field" }, [
							h("span", { className: "gc-field-label" }, t("member.provider")),
							h("select", { className: "gc-input", value: form.provider, onChange: (event) => onProviderChange(event.target.value) }, [
								catalog.groups.length === 0 && h("option", { value: "" }, "—"),
								...catalog.groups.map((groupItem) => h("option", { key: groupItem.id, value: groupItem.id }, `${groupItem.name} (${groupItem.id})`)),
							]),
						]),
						h("label", { className: "gc-field" }, [
							h("span", { className: "gc-field-label" }, t("member.model")),
							h("select", { className: "gc-input", value: form.model, onChange: (event) => patch("model", event.target.value) }, [
								(provider?.models ?? []).length === 0 && h("option", { value: "" }, "—"),
								...(provider?.models ?? []).map((model) => h("option", { key: model.id, value: model.id }, model.name === model.id ? model.id : `${model.name} · ${model.id}`)),
							]),
						]),
						modelInfo?.reasoning !== void 0 && h("label", { className: "gc-field" }, [
							h("span", { className: "gc-field-label" }, t("member.reasoning")),
							h("select", { className: "gc-input", value: form.reasoningEffort, onChange: (event) => patch("reasoningEffort", event.target.value) }, [
								h("option", { value: "" }, t("member.reasoningDefault")),
								...modelInfo.reasoning.efforts.map((effort) => h("option", { key: effort.id, value: effort.id }, effort.name === effort.id ? effort.id : `${effort.name} · ${effort.id}`)),
							]),
						]),
						h("label", { className: "gc-field" }, [
							h("span", { className: "gc-field-label" }, t("member.temperature")),
							h("input", { className: "gc-input", type: "number", min: 0, max: 2, step: 0.1, value: form.temperature, placeholder: "默认", onChange: (event) => patch("temperature", event.target.value) }),
						]),
						h("label", { className: "gc-field" }, [
							h("span", { className: "gc-field-label" }, t("member.maxTokens")),
							h("input", { className: "gc-input", type: "number", min: 64, max: 32768, step: 64, value: form.maxTokens, placeholder: "默认", onChange: (event) => patch("maxTokens", event.target.value) }),
						]),
						h("label", { className: "gc-field gc-field-check" }, [
							h("input", { type: "checkbox", checked: form.enabled, onChange: (event) => patch("enabled", event.target.checked) }),
							h("span", null, t("member.enabled")),
						]),
					]),
					catalog.failures.length > 0 && h("div", { className: "gc-notice" }, catalog.failures.map((failure) => h("div", { key: failure.id }, tpl(t("member.providerFailed"), { name: failure.name, message: failure.message })))),
					h("div", { className: "gc-row" }, [
                        h("button", { type: "button", className: "gc-btn gc-btn-small", disabled: testing || saving || !form.provider || !form.model, onClick: () => void testConnection() }, testing ? "测试中…" : "测试连接"),
                        connection?.state === "connected" && h("span", { className: "gc-connection-success" }, "● 最近测试成功"),
                        h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => void api.refreshCatalog() }, "刷新 API / 模型列表"),
                    ]),
                    h("small", { className: "gc-memory-hint" }, "连接测试会发送一条短请求，可能产生少量 API 用量。"),
					error !== null && h("div", { className: "gc-notice gc-notice-error" }, error),
					h("div", { className: "gc-row gc-row-end" }, [
						h("button", { type: "button", className: "gc-btn", onClick: onClose }, t("member.cancel")),
						h("button", { type: "button", className: "gc-btn gc-btn-primary", disabled: saving, onClick: () => void save() }, t("member.save")),
					]),
				]),
			]);
		}

		// ---------------------------------------------------------------------
		// side panel
		// ---------------------------------------------------------------------
        function externalMemberGroups(state, group, query = "") {
            if (!group) return [];
            const lower = query.toLowerCase();
            return state.groups.filter((candidate) => candidate.id !== group.id).map((candidate) => ({
                group: candidate,
                members: candidate.members.filter((m) => m.enabled && !group.members.some((local) => local.origin?.groupId === candidate.id && local.origin?.memberId === m.id) &&
                    (!lower || `${candidate.name} ${m.name} ${m.persona}`.toLowerCase().includes(lower))),
            })).filter((item) => item.members.length);
        }
		function SidePanel({ group, state, catalog, t, api }) {
			const [taskDraft, setTaskDraft] = useState("");
			const [memoryDraft, setMemoryDraft] = useState(null);
			const [memoryState, setMemoryState] = useState("idle");
			const memoryValue = memoryDraft === null ? (group.memory ?? "") : memoryDraft;

			const addTask = async () => {
				const title = taskDraft.trim();
				if (title === "") return;
				setTaskDraft("");
				try { await api.command({ op: "addTask", groupId: group.id, title }); }
				catch { setTaskDraft(title); }
			};
			const updateTask = (taskId, patch) => {
				void api.command({ op: "updateTask", groupId: group.id, taskId, patch }).catch(() => {});
			};
			const removeTask = (taskId) => {
				void api.command({ op: "removeTask", groupId: group.id, taskId }).catch(() => {});
			};
			const saveMemory = async () => {
				setMemoryState("saving");
				try {
					const result = await api.command({ op: "setMemory", groupId: group.id, memory: memoryValue });
					if (!result.ok) throw new Error(result.error ?? "保存失败");
					setMemoryState("saved");
					setTimeout(() => setMemoryState("idle"), 1500);
				} catch {
					setMemoryState("idle");
				}
			};
			const openEditor = (member) => {
				store.update((draft) => {
					draft.editor = member === void 0 ? { memberId: null } : { memberId: member.id };
				});
			};

			const tasks = group.tasks ?? [];
			const members = group.members ?? [];
            const external = externalMemberGroups(state, group);

			return h("div", { className: "gc-panel", "data-panel": state.panel, key: state.panel }, [
				h("div", { className: "gc-panel-section", "data-gc-section": "members" }, [
					h("div", { className: "gc-panel-head" }, [
						h("span", { className: "gc-panel-title" }, t("panel.members")),
						h("button", { type: "button", className: "gc-icon-btn gc-icon-btn-brand", onClick: () => openEditor(undefined), "aria-label": t("member.add") }, "+"),
					]),
					members.length === 0
						? h("p", { className: "gc-panel-empty" }, t("view.noMembers"))
						: h("ul", { className: "gc-member-list" }, members.map((member) => h("li", { key: member.id, className: "gc-member-row" }, [
							h("span", { className: "gc-avatar-status" }, [Avatar({ member, size: 26 }), h("span", { className: `gc-connection-dot gc-connection-${member.enabled ? member.connection?.state ?? "unknown" : "unknown"}`, title: !member.enabled ? "已停用" : member.connection?.state === "connected" ? `最近调用/测试成功：${new Date(member.connection.checkedAt).toLocaleString()}` : member.connection?.error ?? "尚未测试连接" })]),
							h("div", { className: "gc-member-meta" }, [
								h("div", { className: "gc-member-name" }, member.name),
								h("div", { className: "gc-member-model" }, member.enabled ? member.model : `${member.model} · 停用`),
                                h("small", { className: "gc-memory-hint" }, `${({ read_only: "只读", approval: "审批", full: "完全访问" })[member.permission ?? "full"]}${member.parentId ? ` · 上级 ${members.find((m) => m.id === member.parentId)?.name ?? "无"}` : ""}`),
                                member.origin && h("small", { className: "gc-memory-hint" }, `来自 ${state.groups.find((g) => g.id === member.origin.groupId)?.name ?? member.origin.groupName}`),
							]),
							h("button", { type: "button", className: "gc-icon-btn", title: t("member.edit"), onClick: () => openEditor(member) }, "✎"),
							h("button", { type: "button", className: "gc-icon-btn", title: t("member.remove"), onClick: () => void api.command({ op: "removeMember", groupId: group.id, memberId: member.id }).catch(() => {}) }, "🗑"),
						]))),
				]),
                h("details", { className: "gc-external-picker", "data-gc-section": "members" }, [
                    h("summary", null, "引入其他群的成员"),
                    h("button", { className: "gc-btn gc-btn-small", onClick: () => void api.refresh().catch(() => {}) }, "刷新外群成员"),
                    external.length === 0 && h("p", { className: "gc-memory-hint" }, "暂无可引入的外群成员"),
                    ...external.map(({ group: source, members: candidates }) => h("div", { key: source.id }, [
                        h("strong", null, source.name),
                        ...candidates.map((member) => h("button", { key: member.id, className: "gc-external-item", onClick: () => void api.command({ op: "importMember", groupId: group.id, sourceGroupId: source.id, sourceMemberId: member.id }).catch(() => {}) }, [h("span", null, member.name), h("small", null, member.persona?.split("\n")[0].slice(0, 80) || "尚未填写职责描述")])),
                    ])),
                ]),

                (group.pendingCalls ?? []).some((call) => ["pending", "approved"].includes(call.status)) && h("div", { className: "gc-panel-section", "data-gc-section": "tasks" }, [
                    h("strong", null, "待审批的成员调用"),
                    ...(group.pendingCalls ?? []).filter((call) => ["pending", "approved"].includes(call.status)).map((call) => h("div", { key: call.id, className: "gc-task-row" }, [
                        h("span", null, `${members.find((m) => m.id === call.fromId)?.name ?? "成员"} → ${members.find((m) => m.id === call.toId)?.name ?? "成员"}`),
                        call.status === "approved" ? h("small", null, "已批准，当前任务结束后接力") : h("button", { className: "gc-btn gc-btn-small", onClick: () => void api.command({ op: "approveCall", groupId: group.id, callId: call.id }).catch(() => {}) }, "批准接力"),
                        call.status === "pending" && h("button", { className: "gc-btn gc-btn-small", onClick: () => void api.command({ op: "approveCall", groupId: group.id, callId: call.id, reject: true }).catch(() => {}) }, "拒绝"),
                    ])),
                ]),

				h("div", { className: "gc-panel-section", "data-gc-section": "tasks" }, [
					h("div", { className: "gc-panel-head" }, h("span", { className: "gc-panel-title" }, t("tasks.title"))),
					tasks.length === 0
						? h("p", { className: "gc-panel-empty" }, t("tasks.empty"))
						: h("ul", { className: "gc-task-list" }, tasks.map((task) => h("li", { key: task.id, className: `gc-task-row gc-task-${task.status}` }, [
							h("button", {
								type: "button",
								className: "gc-task-toggle",
								title: task.status === "completed" ? t("tasks.status.in_progress") : t("tasks.status.completed"),
								onClick: () => updateTask(task.id, { status: task.status === "completed" ? "in_progress" : "completed" }),
							}, task.status === "completed" ? "✓" : "○"),
							h("div", { className: "gc-task-body" }, [
								h("div", { className: "gc-task-title" }, task.title),
                                task.assignmentReason && h("small", null, `分工：${task.assignmentReason}`),
                                task.dependsOn?.length > 0 && h("small", null, `前置任务：${task.dependsOn.map((id) => group.tasks.find((item) => item.id === id)?.title ?? "已删除").join("、")}`),
                                task.result && h("details", null, [h("summary", null, "查看成果"), h("div", { className: "gc-bubble-text" }, task.result)]),
                                task.error && h("div", { className: "gc-bubble-text" }, task.error),
                                task.status === "awaiting_approval" && h("div", { className: "gc-row" }, [h("button", { className: "gc-btn gc-btn-small", onClick: () => void api.command({ op: "approveTask", groupId: group.id, taskId: task.id }).catch(() => {}) }, "批准任务"), h("button", { className: "gc-btn gc-btn-small", onClick: () => void api.command({ op: "approveTask", groupId: group.id, taskId: task.id, reject: true }).catch(() => {}) }, "拒绝")]),
								h("div", { className: "gc-task-meta" }, [
									h("select", {
										className: "gc-task-select",
										value: task.assigneeId ?? "",
										onChange: (event) => updateTask(task.id, { assigneeId: event.target.value }),
									}, [
										h("option", { value: "" }, t("tasks.none")),
										...members.map((member) => h("option", { key: member.id, value: member.id }, member.name)),
									]),
									h("button", {
										type: "button",
										className: "gc-task-status",
										title: "状态",
										onClick: () => updateTask(task.id, { status: task.status === "pending" ? "in_progress" : task.status === "in_progress" ? "pending" : "pending" }),
									}, ({ failed: "失败（可重试）", cancelled: "已停止", awaiting_approval: "待审批" })[task.status] ?? t(`tasks.status.${task.status}`)),
									h("button", { type: "button", className: "gc-icon-btn", title: t("tasks.remove"), onClick: () => removeTask(task.id) }, "🗑"),
								]),
							]),
						]))),
					h("div", { className: "gc-row" }, [
						h("input", {
							className: "gc-input", value: taskDraft, maxLength: 200,
							placeholder: t("tasks.addPlaceholder"),
							onChange: (event) => setTaskDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") void addTask();
							},
						}),
						h("button", { type: "button", className: "gc-btn gc-btn-primary", onClick: () => void addTask() }, t("tasks.add")),
					]),
				]),
				h("div", { className: "gc-panel-section", "data-gc-section": "memory" }, [
					h("div", { className: "gc-panel-head" }, h("span", { className: "gc-panel-title" }, t("memory.title"))),
                    h("label", null, [h("input", { type: "checkbox", checked: group.autoMemory !== false, onChange: (event) => void api.command({ op: "setGroupOptions", groupId: group.id, autoMemory: event.target.checked }).catch(() => {}) }), "按成员自动更新对话记录"]),
                    h("small", { className: "gc-memory-hint" }, "每次成功回复后更新，保留最近 8 条观点摘录；不是已核实的事实。"),
                    ...group.members.map((member) => h(MemberMemoryCard, { key: member.id, member, memory: group.memberMemories?.[member.id], groupId: group.id, api })),
                    group.summary && h("details", null, [h("summary", null, "已保存的对话摘要"), h("div", { className: "gc-bubble-text" }, group.summary)]),
					h("textarea", {
						className: "gc-input gc-textarea", rows: 5, value: memoryValue, maxLength: 20000,
						placeholder: t("memory.placeholder"),
						onChange: (event) => setMemoryDraft(event.target.value),
					}),
					h("div", { className: "gc-memory-foot" }, [
						h("span", { className: "gc-memory-hint" }, t("memory.hint")),
						h("button", { type: "button", className: "gc-btn gc-btn-primary", disabled: memoryState === "saving", onClick: () => void saveMemory() }, memoryState === "saved" ? t("memory.saved") : t("memory.save")),
					]),
				]),
				h("button", { type: "button", className: "gc-panel-close", onClick: () => store.update((draft) => { draft.panel = null; }) }, t("panel.close")),
			]);
		}

		// ---------------------------------------------------------------------
		// message bubbles
		// ---------------------------------------------------------------------
		function hostContextOf(binding) {
            const snapshot = binding?.eventSource?.getSnapshot?.();
            const lines = [];
            for (const entry of snapshot?.entries ?? []) {
                if (entry.type !== "event") continue;
                const event = entry.event;
                if (event?.type !== "user/message" && event?.type !== "assistant/message") continue;
                const message = event.type === "assistant/message" ? event.data?.message : event.data;
                const content = message?.content;
                const text = typeof content === "string" ? content : (Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : "");
                if (text.trim()) lines.push(`${event.type === "user/message" ? "用户" : "主对话助手"}: ${text}`);
            }
            const todos = binding?.session?.projections?.faceOf?.("todos")?.getSnapshot?.();
            if (Array.isArray(todos)) for (const task of todos) if (typeof task.content === "string") lines.push(`主对话任务 [${task.status}]: ${task.content}`);
            if (!lines.length) throw new Error("主对话暂未加载文字历史，请先打开原对话，或将背景粘贴到共享记忆。");
            return `来源会话: ${binding.sessionId ?? "当前会话"}\n${lines.join("\n\n").slice(-23000)}`;
        }

        function hostMessagesOf(binding) {
            const entries = binding?.eventSource?.getSnapshot?.()?.entries ?? [];
            const messages = entries.filter((entry) => entry.type === "event" && ["user/message", "assistant/message"].includes(entry.event?.type)).map((entry) => {
                const event = entry.event, message = event.type === "assistant/message" ? event.data?.message : event.data;
                const content = message?.content;
                const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : "";
                return { role: event.type === "user/message" ? "user" : "assistant", text: text.slice(0, 12000), sourceKey: `${binding.sessionId}:${event.seq ?? message?.id ?? "unknown"}`, createdAt: typeof event.time === "number" ? event.time : Date.now() };
            }).filter((entry) => entry.text.trim()).slice(-200);
            while (messages.length > 1 && new TextEncoder().encode(JSON.stringify(messages)).byteLength > 400 * 1024) messages.shift();
            return messages;
        }
        function importPreference() { try { return localStorage.getItem("dsh-groupchat:import-preference") ?? "ask"; } catch { return "ask"; } }
        function FirstImportDialog({ group, sessionId, api, readHostMessages }) {
            const [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
            const choose = async (importHistory) => {
                setBusy(true); setError("");
                try {
                    const result = await api.command({ op: "importHostHistory", groupId: group.id, sessionId, ...(importHistory ? { messages: readHostMessages?.(sessionId) ?? [] } : { skip: true }) });
                    if (remember) try { localStorage.setItem("dsh-groupchat:import-preference", importHistory ? "import" : "skip"); } catch {}
                } catch (e) { setError(e.message); } finally { setBusy(false); }
            };
            const once = useRef(false), preference = importPreference();
            useEffect(() => { if (!once.current && preference !== "ask") { once.current = true; void choose(preference === "import"); } }, []);
            // Failed automatic import offers a choice instead of hanging or inventing history.
            if (preference !== "ask" && !error) return busy ? h("div", { className: "gc-default-hint" }, "正在应用历史导入偏好…") : null;
            return h("div", { className: "gc-modal-backdrop" }, h("div", { className: "gc-modal gc-import-modal", role: "dialog", "aria-label": "首次进入群聊" }, [
                h("h3", null, "是否导入主对话聊天记录？"),
                h("p", null, "把当前已加载的文字聊天复制到这个群的历史，供成员参考；不会自动触发回复。未加载的更早历史不在本次导入范围内。"),
                h("label", null, [h("input", { type: "checkbox", checked: remember, disabled: busy, onChange: (event) => setRemember(event.target.checked) }), "设为默认，下次不再提醒"]),
                error && h("p", { role: "alert" }, error),
                h("div", { className: "gc-row gc-row-end" }, [h("button", { className: "gc-btn", disabled: busy, onClick: () => void choose(false) }, "不导入"), h("button", { className: "gc-btn gc-btn-primary", disabled: busy, onClick: () => void choose(true) }, busy ? "处理中…" : "导入历史")]),
            ]));
        }
        function ManualImportDialog({ group, sessionId, api, readHostMessages, onClose }) {
            const [messages, setMessages] = useState(() => { try { return readHostMessages?.(sessionId) ?? []; } catch { return []; } });
            const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
            const refresh = () => { try { const next = readHostMessages?.(sessionId) ?? []; setMessages(next); setNotice(next.length ? "已刷新" : "主对话尚未加载可导入的文字，可先切到对话等待历史加载，再返回重试。"); } catch (error) { setNotice(error.message); } };
            return h(Modal, { title: "导入主对话历史", onClose }, [
                h("p", null, `当前读取到 ${messages.length} 条用户/助手文字。工具结果和思考过程不会导入；重复点击只追加尚未导入的记录。`),
                h("div", { className: "gc-row" }, [h("button", { className: "gc-btn", disabled: busy, onClick: refresh }, "刷新可导入记录"), h("button", { className: "gc-btn gc-btn-primary", disabled: busy || !messages.length, onClick: async () => { setBusy(true); try { const result = await api.command({ op: "importHostHistory", groupId: group.id, sessionId, messages, append: true }); setNotice(`成功导入 ${result.imported} 条新记录`); } catch (error) { setNotice(error.message); } finally { setBusy(false); } } }, busy ? "导入中…" : "导入历史")]),
                notice && h("p", { role: "status" }, notice),
            ]);
        }
        async function copyText(value) {
            try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; } } catch {}
            const node = document.createElement("textarea"); node.value = value;
            node.style.cssText = "position:fixed;left:-10000px;top:0";
            const previous = document.activeElement; document.body.appendChild(node); node.select();
            let copied;
            try { copied = document.execCommand("copy"); } finally { node.remove(); previous?.focus?.(); }
            if (!copied) throw new Error("复制失败，请手动选中文字复制");
        }
        function CopyButton({ text, label = "复制消息" }) {
            const [status, setStatus] = useState("");
            const timer = useRef(null);
            useEffect(() => () => clearTimeout(timer.current), []);
            return h("button", { type: "button", className: "gc-copy-btn", title: status || label, "aria-label": label,
                onClick: async () => {
                    try { await copyText(text); setStatus("已复制"); }
                    catch (error) { setStatus(error.message); }
                    clearTimeout(timer.current); timer.current = setTimeout(() => setStatus(""), 2000);
                } }, [h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true }, status === "已复制" ? h("path", { d: "M5 12l4 4L19 6", strokeLinecap: "round", strokeLinejoin: "round" }) : [h("rect", { x: 8, y: 8, width: 12, height: 12, rx: 2 }), h("path", { d: "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" })]), status && status !== "已复制" && h("span", { role: "alert" }, status), h("span", { className: "gc-sr-only", role: "status" }, status)]);
        }
        function safeLink(url) { return /^(https?:\/\/|mailto:|#)/i.test(url.trim()) ? url.trim() : null; }
        function inlineMarkdown(text, members, t) {
            const parts = [], pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
            let end = 0, match;
            const plain = (value, key) => members ? h(MentionedText, { key, text: value, members, t }) : value;
            while ((match = pattern.exec(text))) {
                if (match.index > end) parts.push(plain(text.slice(end, match.index), `p${end}`));
                const token = match[0], key = `i${match.index}`;
                if (token.startsWith("`")) parts.push(h("code", { key }, token.slice(1, -1)));
                else if (token.startsWith("**") || token.startsWith("__")) parts.push(h("strong", { key }, token.slice(2, -2)));
                else if (token.startsWith("*")) parts.push(h("em", { key }, token.slice(1, -1)));
                else {
                    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token), href = safeLink(link[2]);
                    parts.push(href ? h("a", { key, href, target: "_blank", rel: "noopener noreferrer" }, link[1]) : plain(link[1], key));
                }
                end = pattern.lastIndex;
            }
            if (end < text.length) parts.push(plain(text.slice(end), `p${end}`));
            return parts;
        }
        // A text-only Markdown subset: React escapes content; never parse raw HTML.
        function markdownBlocks(text) {
            const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n"), blocks = [];
            const cell = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((part) => part.trim());
            for (let i = 0; i < lines.length;) {
                const line = lines[i], fence = /^\s*(`{3,}|~{3,})([^\s]*)\s*$/.exec(line);
                if (fence) {
                    const rows = [], marker = fence[1][0], length = fence[1].length; i++;
                    while (i < lines.length && !(lines[i].trim().length >= length && [...lines[i].trim()].every((ch) => ch === marker))) rows.push(lines[i++]);
                    const closed = i < lines.length;
                    if (closed) i++;
                    blocks.push({ type: "code", language: fence[2], text: rows.join("\n"), incomplete: !closed }); continue;
                }
                if (!line.trim()) { i++; continue; }
                if (i + 1 < lines.length && line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
                    const headers = cell(line), rows = []; i += 2;
                    while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cell(lines[i++]));
                    blocks.push({ type: "table", headers, rows }); continue;
                }
                const heading = /^(#{1,6})\s+(.+)$/.exec(line);
                if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); i++; continue; }
                if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
                const list = /^\s*([-+*]|\d+[.)])\s+(.+)$/.exec(line);
                if (list) { blocks.push({ type: "list", ordered: /^\d/.test(list[1]), text: list[2], number: parseInt(list[1]) || 1 }); i++; continue; }
                if (/^\s*>\s?/.test(line)) { blocks.push({ type: "quote", text: line.replace(/^\s*>\s?/, "") }); i++; continue; }
                blocks.push({ type: "paragraph", text: line }); i++;
            }
            return blocks;
        }
        function MarkdownMessage({ text, members, t, streaming }) {
            const blocks = markdownBlocks(text);
            return h("div", { className: `gc-markdown${streaming ? " gc-markdown-streaming" : ""}` }, blocks.map((block, index) => {
                const key = `block${index}`, inline = () => inlineMarkdown(block.text, members, t);
                if (block.type === "code") return h("section", { key, className: "gc-code-block" }, [
                    h("div", { className: "gc-code-head" }, [h("span", null, `${block.language || "代码"}${block.incomplete && streaming ? " · 输出中" : ""}`), h(CopyButton, { text: block.text, label: "复制代码" })]),
                    h("pre", null, h("code", null, block.text)),
                ]);
                if (block.type === "table") return h("div", { key, className: "gc-table-scroll" }, h("table", null, [
                    h("thead", null, h("tr", null, block.headers.map((value, i) => h("th", { key: i }, inlineMarkdown(value, members, t))))),
                    h("tbody", null, block.rows.map((row, i) => h("tr", { key: i }, block.headers.map((_, j) => h("td", { key: j }, inlineMarkdown(row[j] ?? "", members, t)))))),
                ]));
                if (block.type === "heading") return h(`h${block.level}`, { key }, inline());
                if (block.type === "rule") return h("hr", { key });
                if (block.type === "quote") return h("blockquote", { key }, inline());
                if (block.type === "list") return h(block.ordered ? "ol" : "ul", { key, ...(block.ordered ? { start: block.number } : {}) }, h("li", null, inline()));
                return h("p", { key }, inline());
            }));
        }
        function MemberMemoryCard({ member, memory, api, groupId }) {
            const [draft, setDraft] = useState(null), [error, setError] = useState("");
            const run = async (body) => { try { await api.command({ op: "setMemberMemory", groupId, memberId: member.id, ...body }); setError(""); setDraft(null); } catch (e) { setError(e.message); } };
            return h("details", { className: "gc-member-memory", open: true }, [
                h("summary", null, `${member.name} · ${(memory?.notes ?? []).length} 条记录`),
                h("textarea", { className: "gc-input gc-textarea", rows: 2, maxLength: 5000, placeholder: "给该成员固定的记忆（不会被自动记录覆盖）", value: draft ?? memory?.manual ?? "", onChange: (event) => setDraft(event.target.value) }),
                h("div", { className: "gc-row" }, [h("button", { className: "gc-btn gc-btn-small", disabled: draft === null, onClick: () => void run({ manual: draft }) }, "保存"), h("button", { className: "gc-btn gc-btn-small", onClick: () => void run({ clearNotes: true }) }, "清除自动记录")]),
                error && h("div", { role: "alert" }, error),
                ...(memory?.notes ?? []).slice().reverse().map((note) => h("div", { key: note.sourceId, className: "gc-memory-note" }, [h("small", null, fmtTime(note.createdAt)), h("div", null, note.text)])),
            ]);
        }
		function MessageBubble({ message, group, t }) {
			if (message.kind === "system") {
				return h("div", { className: "gc-sys-row" }, h("span", { className: "gc-sys-chip" }, message.text));
			}
			if (message.kind === "user") {
				return h("div", { className: "gc-msg-row gc-msg-user" }, [
					h("div", { className: "gc-msg-stack" }, [
						h("div", { className: "gc-msg-meta" }, [
							h("span", { className: "gc-msg-name" }, t("user.name")),
							h("span", { className: "gc-msg-time" }, fmtTime(message.createdAt)),
                            h(CopyButton, { text: message.text }),
						]),
						h("div", { className: "gc-bubble gc-bubble-user" }, h(MarkdownMessage, { text: message.text, members: group.members, t })),
					]),
				]);
			}
			const member = memberOf(group, message.speakerId);
			const streaming = message.status === "streaming";
			return h("div", { className: "gc-msg-row gc-msg-member" }, [
				Avatar({ member: member ?? { name: message.speakerName, avatar: "🤖", color: "#4d7bfe" }, size: 30 }),
				h("div", { className: "gc-msg-stack" }, [
					h("div", { className: "gc-msg-meta" }, [
						h("span", { className: "gc-msg-name" }, message.speakerName),
						message.model !== void 0 && h("span", { className: "gc-msg-model" }, message.model),
						h("span", { className: "gc-msg-time" }, fmtTime(message.createdAt)),
                            h(CopyButton, { text: message.text }),
						streaming && h("span", { className: "gc-msg-typing" }, t("streaming")),
					]),
					h("div", { style: { "--gc-member-color": member?.color ?? "#4d7bfe" }, className: message.status === "error" ? "gc-bubble gc-bubble-member gc-bubble-error" : "gc-bubble gc-bubble-member" },
						h(MarkdownMessage, { text: message.text, members: group.members, t, streaming })),
				]),
			]);
		}

		// ---------------------------------------------------------------------
		// main view
		// ---------------------------------------------------------------------
		class GcErrorBoundary extends React.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error, info) {
				if (typeof console !== "undefined") console.error("[dsh-groupchat] view render error:", error, info);
			}
			render() {
				if (this.state.error !== null) {
					return h("div", { className: "gc-error-boundary" }, [
						h("div", { className: "gc-error-title" }, "群聊视图渲染出错"),
						h("div", { className: "gc-error-detail" }, String(this.state.error?.message ?? this.state.error)),
						h("button", { type: "button", className: "gc-btn", onClick: () => this.setState({ error: null }) }, "重试"),
					]);
				}
				return this.props.children;
			}
		}
        const layoutHistory = [];
        function layoutSnapshot(node, sessionId, event) {
            const ancestors = [];
            for (let el = node; el && ancestors.length < 10; el = el.parentElement) {
                const css = getComputedStyle(el), rect = el.getBoundingClientRect();
                ancestors.push({ tag: el.tagName, className: String(el.className), slot: el.getAttribute("data-slot"),
                    phase: el.getAttribute("data-phase") ?? el.getAttribute("data-content-phase"),
                    width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top),
                    display: css.display, position: css.position, flex: css.flex, minHeight: css.minHeight,
                    overflow: css.overflow, visibility: css.visibility, contain: css.contain, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
            }
            const state = store.getSnapshot();
            return { version: "1.1.0-beta.8", event, time: new Date().toISOString(), sessionId,
                loaded: state.loadStatus, connected: state.connected, groups: state.groups.length,
                selectedTabs: [...document.querySelectorAll("[data-conversation-tabs] [role='tab']")].map(el => ({ id: el.id, selected: el.getAttribute("aria-selected") })),
                contentSessionId: document.querySelector("[data-conversation-session]")?.getAttribute("data-conversation-session") ?? null,
                nodeConnected: Boolean(node?.isConnected), activeGroupId: activeGroup(state)?.id ?? null,
                nativeInputs: [...document.querySelectorAll("textarea")].filter(el => !el.closest(".gc-view") && el.getClientRects().length > 0).length,
                messages: activeGroup(state)?.messages.length ?? 0,
                views: document.querySelectorAll(".gc-view").length,
                pluginInputs: document.querySelectorAll(".gc-composer-input").length,
                ancestors, sections: [".gc-topbar", ".gc-main", ".gc-chat", ".gc-messages", ".gc-composer", ".gc-panel"].map(selector => {
                    const el = node?.querySelector(selector); if (!el) return { selector, present: false };
                    const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
                    return { selector, present: true, top: Math.round(rect.top), height: Math.round(rect.height), width: Math.round(rect.width), display: css.display, flex: css.flex, position: css.position, order: css.order };
                }) };
        }
        function anchorGroupLayout(node, sessionId) {
            if (!node) return () => {};
            const host = node.closest("[data-conversation-content]") ?? node.closest("[data-conversation-region='chat']") ?? node.closest("[data-conversation-scroll]");
            const record = (event) => {
                recordDiagnostic(event, { sessionId, hostScrollTop: node.closest("[data-conversation-scroll]")?.scrollTop });
                layoutHistory.push(layoutSnapshot(node, sessionId, event));
                if (layoutHistory.length > 24) layoutHistory.shift();
            };
            record("mount-before-anchor");
            if (!host) { record("missing-host"); return () => {}; }
            const changes = [];
            const mark = (element, key) => {
                const previous = element.getAttribute(key);
                element.setAttribute(key, "beta.8"); changes.push(() => {
                    if (element.getAttribute(key) !== "beta.8") return;
                    if (previous === null) element.removeAttribute(key); else element.setAttribute(key, previous);
                });
            };
            const ownStyle = (element, property, value) => {
                const before = element.style.getPropertyValue(property), priority = element.style.getPropertyPriority(property);
                element.style.setProperty(property, value, "important");
                changes.push(() => {
                    if (element.style.getPropertyValue(property) !== value || element.style.getPropertyPriority(property) !== "important") return;
                    if (before) element.style.setProperty(property, before, priority); else element.style.removeProperty(property);
                });
            };
            mark(host, "data-gc-host"); mark(node, "data-gc-anchored");
            // Host style properties belong to DSH. Only scoped attributes/CSS are used.
            const scroller = node.closest("[data-conversation-scroll]");
            const resetHostScroll = () => { if (scroller && scroller.scrollTop !== 0) { recordDiagnostic("restored-scroll-reset", { sessionId, scrollTop: scroller.scrollTop }); scroller.scrollTop = 0; } if (host.scrollTop !== 0) host.scrollTop = 0; };
            resetHostScroll();
            scroller?.addEventListener("scroll", resetHostScroll);
            if (host !== scroller) host.addEventListener("scroll", resetHostScroll);
            // Only this active view's ancestor path is adjusted; native chat is restored on unmount.
            for (let parent = node.parentElement; parent && parent !== host; parent = parent.parentElement) {
                mark(parent, "data-gc-bridge");
                // Bridge geometry is scoped in CSS and disappears with this view.
            }
            const resize = () => {
                if (!node.isConnected) return;
                resetHostScroll();
                const css = getComputedStyle(host);
                const height = host.clientHeight - parseFloat(css.paddingTop || "0") - parseFloat(css.paddingBottom || "0");
                const value = `${Math.max(0, height)}px`;
                if (node.style.getPropertyValue("--gc-host-height") !== value) node.style.setProperty("--gc-host-height", value);
                record("host-resize");
            };
            resize();
            const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
            observer?.observe(host);
            for (const selector of [".gc-main", ".gc-composer", ".gc-topbar"]) { const element = node.querySelector(selector); if (element) observer?.observe(element); }
            let mutationFrame = null, lastGeometry = "";
            const mutations = typeof MutationObserver === "function" ? new MutationObserver(() => {
                if (mutationFrame !== null) return;
                mutationFrame = requestAnimationFrame(() => {
                    mutationFrame = null; resetHostScroll();
                    const geometry = JSON.stringify(layoutSnapshot(node, sessionId, "measure").ancestors.map(a => [a.width,a.height,a.top,a.display,a.position,a.flex,a.phase]));
                    if (geometry !== lastGeometry) { lastGeometry = geometry; resize(); record("ancestor-layout-change"); }
                });
            }) : null;
            for (let ancestor = node.parentElement, depth = 0; ancestor && depth < 10; ancestor = ancestor.parentElement, depth++) {
                mutations?.observe(ancestor, { attributes: true, attributeFilter: ["class", "style", "data-phase", "data-content-phase", "data-conversation-session"] });
            }
            let previousLayout = "";
            const captureChangedLayout = () => {
                const snapshot = layoutSnapshot(node, sessionId, "layout-change");
                const key = JSON.stringify({ ancestors: snapshot.ancestors, sections: snapshot.sections, messages: snapshot.messages, loaded: snapshot.loaded });
                if (key !== previousLayout) { previousLayout = key; record("layout-change"); }
            };
            const sampleTimer = setInterval(captureChangedLayout, 1000);
            captureChangedLayout();
            window.addEventListener("resize", resize);
            const frame = requestAnimationFrame(resize);
            return () => { clearInterval(sampleTimer); record("unmount"); cancelAnimationFrame(frame); observer?.disconnect(); mutations?.disconnect(); if (mutationFrame !== null) cancelAnimationFrame(mutationFrame);
                scroller?.removeEventListener("scroll", resetHostScroll); host.removeEventListener("scroll", resetHostScroll);
                window.removeEventListener("resize", resize); node.style.removeProperty("--gc-host-height");
                for (const restore of changes.reverse()) restore();
            };
        }
        function downloadDiagnostics(node, sessionId) {
            const payload = { bootLog, current: layoutSnapshot(node, sessionId, "export"), history: layoutHistory,
                viewport: { width: window.innerWidth, height: window.innerHeight }, userAgent: navigator.userAgent,
                styleLoaded: Boolean(document.getElementById("dsh-groupchat-style")) };
            saveDiagnostic(payload);
        }
        function GlobalSettings() {
            const state = useStore();
            const [draft, setDraft] = useState(() => ({ ...state.preferences }));
            const [notice, setNotice] = useState("");
            const patch = (key, value) => { setDraft(current => ({ ...current, [key]: value })); setNotice(""); };
            const row = (label, control, hint) => h("label", { className: "gc-setting-row" }, [h("strong", null, label), control, hint && h("small", null, hint)]);
            return h("div", { className: "gc-settings gc-theme" }, [
                h("h2", null, "多 AI 群聊 · 全局设置"), h("p", null, "保存在当前客户端，外观立即生效；默认模式用于之后新建的群，已有任务继续运行。"),
                row("主对话历史导入", h("select", { className: "gc-input", value: draft.importMode, "aria-label": "导入方式", onChange: event => patch("importMode", event.target.value) }, [h("option", { value: "ask" }, "每次询问"), h("option", { value: "import" }, "默认导入"), h("option", { value: "skip" }, "默认不导入")]), "只导入当前可读取的用户和助手文字，不导入工具结果或思考过程。"),
                row(`气泡不透明度：${draft.bubbleOpacity}%`, h("input", { type: "range", min: 20, max: 100, value: draft.bubbleOpacity, "aria-label": "气泡不透明度", onChange: event => patch("bubbleOpacity", Number(event.target.value)) }), "默认 100%，背景透明仍可保留壁纸；降低后可能影响可读性。"),
                row("用户气泡颜色", h("input", { type: "color", value: draft.userColor, "aria-label": "用户气泡颜色", onChange: event => patch("userColor", event.target.value) })),
                row("新机器人随机颜色", h("input", { type: "checkbox", checked: draft.randomColors, onChange: event => patch("randomColors", event.target.checked) }), "优先抽取本群未使用的颜色；创建后可在成员编辑中修改。"),
                row("新群允许机器人管理", h("input", { type: "checkbox", checked: draft.allowAgentManagement, onChange: event => patch("allowAgentManagement", event.target.checked) }), "仅完全访问成员可创建下级或调用本群机器人；继承模型，记录操作，调用仍受轮数限制。已有群在输入框工具栏单独设置。"),
                row("新群默认协作模式", h("input", { type: "checkbox", checked: draft.defaultWorkMode, onChange: event => patch("defaultWorkMode", event.target.checked) })),
                row("发送时默认带入主对话", h("input", { type: "checkbox", checked: draft.includeMain, onChange: event => patch("includeMain", event.target.checked) }), "每次发送读取可用的主对话背景；可在输入框单独关闭。"),
                row("Enter 发送", h("input", { type: "checkbox", checked: draft.enterToSend, onChange: event => patch("enterToSend", event.target.checked) }), "关闭后 Enter 换行，用发送按钮发送。输入法确认不会发送。"),
                row("侧栏默认宽度", h("input", { className: "gc-input", type: "number", min: 240, max: 600, value: draft.panelWidth, onChange: event => patch("panelWidth", Number(event.target.value)) })),
                h("div", { className: "gc-row", style: { marginTop: 20 } }, [
                    h("button", { className: "gc-btn gc-btn-primary", onClick: () => { try { savePreferences(draft); setNotice("已保存，外观立即生效"); } catch (error) { setNotice(error.message); } } }, "保存偏好"),
                    h("button", { className: "gc-btn", onClick: () => { setDraft({ ...UI_DEFAULTS }); setNotice("已恢复默认值，点击保存生效"); } }, "恢复默认"),
                    h("button", { className: "gc-btn", onClick: () => downloadDiagnostics(document.querySelector(".gc-view"), store.getSnapshot().viewSessionId) }, "导出诊断"),
                ]), notice && h("p", { role: "status" }, notice),
                h("p", null, "协作权限只管理本插件的任务和文字接力。联网、读取 skill、文件及终端工具尚未接入，不会因开启完全访问而获得这些能力。"),
            ]);
        }
        function ImportPreferenceDialog({ onClose }) {
            return h(Modal, { title: "主对话导入偏好 / 全局设置", onClose }, h(GlobalSettings));
        }
        function ResizablePanel(props) {
            const [width, setWidth] = useState(() => { try { return Math.max(240, Math.min(600, Number(localStorage.getItem("dsh-groupchat:panel-width")) || 320)); } catch { return 320; } });
            const drag = useRef(null);
            useEffect(() => { setWidth(props.state.preferences.panelWidth); }, [props.state.preferences.panelWidth]);
            const save = value => { try { localStorage.setItem("dsh-groupchat:panel-width", String(value)); } catch {} };
            return h("aside", { className: "gc-panel-shell", style: { "--gc-panel-width": `${width}px` } }, [
                h("div", { className: "gc-panel-resize", role: "separator", "aria-label": "调整侧栏宽度", "aria-orientation": "vertical", "aria-valuemin": 240, "aria-valuemax": 600, "aria-valuenow": width, tabIndex: 0,
                    onPointerDown: event => { event.preventDefault(); drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); },
                    onPointerMove: event => { if (drag.current) setWidth(Math.max(240, Math.min(600, drag.current.width + drag.current.x - event.clientX))); },
                    onPointerUp: event => { drag.current = null; save(width); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
                    onPointerCancel: () => { drag.current = null; },
                    onKeyDown: event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); const value = Math.max(240, Math.min(600, width + (event.key === "ArrowLeft" ? 20 : -20))); setWidth(value); save(value); } },
                }),
                h(SidePanel, props),
            ]);
        }

		function GroupChatView(props) {
			const { t, api } = props;
            const viewRef = useRef(null);
            const [preferencesOpen, setPreferencesOpen] = useState(false);
            const [renameDraft, setRenameDraft] = useState(null);
            const [importOpen, setImportOpen] = useState(false);
            useLayoutEffect(() => {
                store.update((draft) => { draft.viewSessionId = props.sessionId ?? null; draft.activeGroupId = draft.groups.find((g) => g.hostSessionId === props.sessionId)?.id ?? null; draft.editor = null; });
                return () => { if (store.getSnapshot().viewSessionId === props.sessionId) store.update((draft) => { draft.viewSessionId = null; }); };
            }, [props.sessionId]);
            useLayoutEffect(() => anchorGroupLayout(viewRef.current, props.sessionId), [props.sessionId]);
			// Host composer stays mounted; scoped CSS hides its seat while this view exists.
			const state = useStore();
			const listRef = useRef(null);
			const nearBottomRef = useRef(true);
			const hostModelSource = props.resolveMainModelSource?.(props.sessionId) ?? props.mainModelSource ?? ABSENT_MODEL_SOURCE;
			useEffect(() => { props.loadMainModel?.(props.sessionId); }, [hostModelSource, props.sessionId]);
			const modelSnapshot = useSyncExternalStore((fn) => hostModelSource.subscribe(fn), () => hostModelSource.getSnapshot());
			const mainSelection = mainSelectionOf(modelSnapshot);

			// 数据加载与 SSE 订阅由 apply 层统一管理，视图只负责渲染。

			const group = activeGroup(state);
            useEffect(() => {
                if (state.loadStatus === "ready" && props.sessionId && !group) void api.ensureSessionGroup(props.sessionId, props.readSessionTitle?.(props.sessionId)).catch(() => {});
            }, [api, props.sessionId, state.loadStatus, group?.id]);
			useEffect(() => {
				if (group && group.members.length === 0 && mainSelection) {
					void api.ensureGroupMember(group.id, mainSelection).catch(() => {});
				}
			}, [api, group?.id, group?.members.length, mainSelection?.provider, mainSelection?.model, mainSelection?.reasoningEffort]);
			const editorMember = state.editor !== null && group !== void 0
				? memberOf(group, state.editor.memberId ?? "")
				: void 0;

			useLayoutEffect(() => { nearBottomRef.current = true; }, [group?.id]);

			useLayoutEffect(() => {
				const node = listRef.current;
				if (node === null) return;
				if (nearBottomRef.current) node.scrollTop = node.scrollHeight;
			}, [state.groups, state.typing, state.busy, props.sessionId]);

			const onScroll = () => {
				const node = listRef.current;
				if (node === null) return;
				nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
			};


            const renameGroup = () => { if (group) setRenameDraft(group.name); };

			const deleteGroup = () => {
				if (group === void 0) return;
				const runDelete = async () => {
					store.update((draft) => {
						draft.confirm = null;
					});
					try {
						const result = await api.command({ op: "deleteGroup", groupId: group.id });
						if (result.ok) {
							store.update((draft) => {
								draft.groups = draft.groups.filter((candidate) => candidate.id !== group.id);
								draft.activeGroupId = draft.groups[0]?.id ?? null;
							});
						} else {
							store.update((draft) => {
								draft.error = result.error ?? "删除失败";
							});
						}
					} catch (error) {
						store.update((draft) => {
							draft.error = error instanceof Error ? error.message : String(error);
						});
					}
				};
				store.update((draft) => {
					draft.confirm = { text: t("group.deleteConfirm"), onOk: runDelete };
				});
			};
			const clearMessages = () => {
				if (group !== void 0) void api.command({ op: "clearMessages", groupId: group.id }).catch(() => {});
			};

			const typingMembers = (group?.members ?? []).filter((member) => state.typing.includes(member.id));
			const responderMembers = (group?.members ?? []).filter((member) => state.responders.includes(member.id));

			return h("div", { ref: viewRef, className: "gc-view", style: { "--gc-bubble-alpha": `${state.preferences.bubbleOpacity}%`, "--gc-user-color": state.preferences.userColor }, "data-conversation-composer-overlay": "", "data-groupchat-view": "1.1.0-beta.8" }, [
				state.error !== null && h("div", { className: "gc-banner" }, [
					h("span", null, state.error),
					h("button", { type: "button", className: "gc-btn", onClick: () => { void api.refresh().then(() => api.ensureSessionGroup(props.sessionId)).catch(() => {}); void api.refreshCatalog(); } }, "重试"),
					h("button", { type: "button", className: "gc-icon-btn", onClick: () => store.update((draft) => { draft.error = null; }) }, "✕"),
				]),
				!state.connected && h("div", { className: "gc-banner gc-banner-warn" }, t("view.connectionLost")),
				state.catalogError && h("div", { className: "gc-banner gc-banner-warn" }, [
					h("span", null, `模型列表加载失败：${state.catalogError}`),
					h("button", { type: "button", className: "gc-btn", onClick: () => void api.refreshCatalog() }, "重试模型列表"),
				]),
				h("div", { className: "gc-topbar" }, [
					h("span", { className: "gc-version", title: "已加载的客户端版本" }, "群聊 beta.8"),
					h("div", { className: "gc-groups" }, [
                        h("span", { className: "gc-group-title" }, group?.name ?? "正在绑定当前对话…"),
					]),
					h("div", { className: "gc-top-actions" }, [
                        group && h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => setImportOpen(true) }, "导入主对话"),
                        h("button", { type: "button", className: "gc-btn gc-btn-small", title: "修改后续新对话的导入偏好", onClick: () => setPreferencesOpen(true) }, "导入偏好 / 全局设置"),
                        h("button", { type: "button", className: "gc-btn gc-btn-small", title: "导出布局和生命周期信息，不含聊天内容或 API 密钥", onClick: () => downloadDiagnostics(viewRef.current, props.sessionId) }, "导出诊断"),
						h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => store.update((draft) => { draft.panel = draft.panel === "members" ? null : "members"; }) }, t("panel.members")),
						h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => store.update((draft) => { draft.panel = draft.panel === "tasks" ? null : "tasks"; }) }, t("panel.tasks")),
						h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: () => store.update((draft) => { draft.panel = draft.panel === "memory" ? null : "memory"; }) }, t("panel.memory")),
						group !== void 0 && h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: renameGroup }, t("actions.rename")),
						group !== void 0 && h("button", { type: "button", className: "gc-btn gc-btn-small", onClick: clearMessages }, t("actions.clear")),
						group !== void 0 && h("button", { type: "button", className: "gc-btn gc-btn-small gc-btn-danger", onClick: deleteGroup }, t("actions.delete")),
					]),
				]),
				group && group.members.length === 0 && h("div", { className: "gc-default-hint" }, mainSelection
					? `正在添加主对话助手：${mainSelection.provider} / ${mainSelection.model}`
					: "正在读取主对话所选模型；也可点击「成员」手动添加"),
				h("div", { className: "gc-main" }, [
					h("div", { className: "gc-chat" }, [
						group === void 0
							? h("div", { className: "gc-center" }, state.loadStatus === "loading" ? t("view.loading") : state.loadStatus === "error" ? "加载失败，请点击重试" : t("view.empty"))
							: h("div", { className: "gc-messages", ref: listRef, onScroll }, [
								(group.messages ?? []).map((message) => h(MessageBubble, { key: message.id, message, group, t })),
								(state.busy || typingMembers.length > 0) && h("div", { className: "gc-msg-row gc-msg-member" }, [
									h("div", { className: "gc-typing-dots" }, [0, 1, 2].map((dot) => h("span", { key: dot, className: "gc-dot", style: { animationDelay: `${dot * 150}ms` } }))),
									h("div", { className: "gc-typing-label" }, typingMembers.length > 0
										? `${typingMembers.map((member) => member.name).join("、")} ${t("busy.replying")}`
										: responderMembers.length > 0
											? `${responderMembers.map((member) => member.name).join("、")} ${t("busy.queued")}`
											: t("streaming")),
								]),
								(group.messages ?? []).length === 0 && h("div", { className: "gc-center" }, [
									group.members.length === 0 ? "点击「成员」添加 AI，开始群聊" : "群聊已就绪，发送消息开始协作",
									h("div", { className: "gc-welcome-hint" }, t("composer.placeholder")),
								]),
							]),
					]),
					state.panel !== null && group !== void 0 && h(ResizablePanel, { key: group.id, group, state, catalog: state.catalog ?? { groups: [], failures: [] }, t, api }),
				]),
				h(GroupChatComposer, { key: group?.id ?? "empty", t, api, mainSelection, sessionId: props.sessionId, readHostContext: props.readHostContext }),
				state.editor !== null && group !== void 0 && h(MemberEditor, {
					key: `${group.id}:${state.editor.memberId ?? "new"}`,
					group,
					member: editorMember,
					catalog: state.catalog ?? { groups: [], failures: [] },
					t,
					api,
					onClose: () => store.update((draft) => { draft.editor = null; }),
				}),
				group && group.hostImportDecision !== "imported" && group.hostImportDecision !== "skipped" && h(FirstImportDialog, { key: `import:${group.id}`, group, sessionId: props.sessionId, api, readHostMessages: props.readHostMessages }),
                importOpen && group && h(ManualImportDialog, { key: `manual-import:${group.id}`, group, sessionId: props.sessionId, api, readHostMessages: props.readHostMessages, onClose: () => setImportOpen(false) }),
                preferencesOpen && h(ImportPreferenceDialog, { key: "preferences", onClose: () => setPreferencesOpen(false) }),
                renameDraft !== null && h(Modal, { key: "rename", title: "重命名群聊", onClose: () => setRenameDraft(null) }, [
                    h("input", { className: "gc-input", value: renameDraft, maxLength: 60, "aria-label": "群聊名称", onChange: event => setRenameDraft(event.target.value) }),
                    h("button", { className: "gc-btn gc-btn-primary", style: { marginTop: 12 }, onClick: async () => { try { await api.command({ op: "renameGroup", groupId: group.id, name: renameDraft.trim() || group.name }); setRenameDraft(null); } catch {} } }, "保存名称"),
                ]),
                state.confirm !== null && h(ConfirmDialog, {
					text: state.confirm.text,
					t,
					onCancel: () => store.update((draft) => { draft.confirm = null; }),
					onOk: () => state.confirm?.onOk?.(),
				}),
			]);
		}

		// ---------------------------------------------------------------------
		// composer (chain replacement)
		// ---------------------------------------------------------------------
		function GroupChatComposer(props) {
			const { t, api } = props;
			const state = useStore();
			const group = activeGroup(state);
			const draft = state.drafts[group?.id ?? ""] ?? "";
			const setDraft = (value) => store.update((next) => { if (group) next.drafts[group.id] = value; });
			const sendingRef = useRef(false);
			const [sending, setSending] = useState(false);
            const [includeMain, setIncludeMain] = useState(() => state.preferences.includeMain);
			const [mention, setMention] = useState(null); // { start, query }
			const textRef = useRef(null);
			const members = (group?.members ?? []).filter((member) => member.enabled);

			const onChange = (value) => {
				setDraft(value);
				const cursor = textRef.current?.selectionStart ?? value.length;
				const before = value.slice(0, cursor);
				const match = /(?:^|[^@\w])@([^\s@,，、:：。！？!?]*)$/u.exec(before);
				if (match !== null && group !== void 0) {
					setMention({ start: before.length - match[1].length - 1, query: match[1] });
				} else {
					setMention(null);
				}
			};

			const externalSuggestions = mention ? externalMemberGroups(state, group, mention.query) : [];
            const suggestions = useMemo(() => {
				if (mention === null) return [];
				const query = mention.query.toLowerCase();
				return members.filter((member) => member.name.toLowerCase().includes(query) || query === "");
			}, [mention, members]);

			const applyMention = (name) => {
				if (mention === null) return;
				const suffix = draft.slice(mention.start);
				const next = `${draft.slice(0, mention.start)}@${name} ${suffix.replace(/^@[^\s@,，、:：。！？!?]*/, "")}`;
				setDraft(next);
				setMention(null);
				requestAnimationFrame(() => {
					const node = textRef.current;
					if (node === null) return;
					const position = mention.start + name.length + 2;
					node.focus();
					node.setSelectionRange(position, position);
				});
			};

            const applyExternalMention = async (source, member) => {
                try {
                    const result = await api.command({ op: "importMember", groupId: group.id, sourceGroupId: source.id, sourceMemberId: member.id });
                    if (activeGroup(store.getSnapshot())?.id === group.id) applyMention(result.member.name);
                } catch {}
            };

			const submit = async () => {
				const text = draft.trim();
				if (text === "" || group === void 0 || state.busy || sendingRef.current) return;
				sendingRef.current = true; setSending(true);
				setDraft("");
				setMention(null);
				try {
					if (includeMain) await api.command({ op: "setHostContext", groupId: group.id, context: props.readHostContext?.(props.sessionId) });
                    await api.sendMessage(group.id, text, props.mainSelection, group.workMode);
				} catch (error) {
					store.update((draftState) => {
						draftState.error = error instanceof Error ? error.message : String(error);
						if (!draftState.drafts[group.id]) draftState.drafts[group.id] = text;
					});
				} finally { sendingRef.current = false; setSending(false); }
			};

			const onKeyDown = (event) => {
                if (event.key === "Enter") event.stopPropagation();
				if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return;
				if (mention !== null) {
					if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === "Escape") {
						event.preventDefault();
						if (event.key === "Enter" && suggestions.length > 0) {
							applyMention(suggestions[0].name);
						} else if (event.key === "Enter" && externalSuggestions.length) {
                            void applyExternalMention(externalSuggestions[0].group, externalSuggestions[0].members[0]);
                        } else if (event.key === "Escape") {
							setMention(null);
						}
						return;
					}
				}
				if (event.key === "Enter" && !event.shiftKey && state.preferences.enterToSend && !(event.nativeEvent?.isComposing === true)) {
					event.preventDefault();
					void submit();
				}
			};

			const loading = state.loadStatus === "idle" || state.loadStatus === "loading";

			const operation = async (op) => {
                if (!group || state.busy || sendingRef.current) return;
                sendingRef.current = true; setSending(true);
                try {
                    await api.ensureGroupMember(group.id, props.mainSelection);
                    if (includeMain) await api.command({ op: "setHostContext", groupId: group.id, context: props.readHostContext?.(props.sessionId) });
                    await api.command({ op, groupId: group.id, ...(op === "planTasks" ? { text: draft.trim() } : {}) });
                    if (op === "planTasks") setDraft("");
                } catch (error) { store.update((next) => { next.error = error.message ?? String(error); }); }
                finally { sendingRef.current = false; setSending(false); }
            };
            return h("div", { className: "gc-composer" }, [
                h("div", { className: "gc-row", style: { flexWrap: "wrap", paddingBottom: 6 } }, [
                    h("select", { className: "gc-task-select gc-mode-select", "aria-label": "对话模式", value: group?.workMode ? "work" : "chat", disabled: state.busy || sending || !group, onChange: (event) => void api.command({ op: "setGroupOptions", groupId: group.id, workMode: event.target.value === "work" }).catch(() => {}) }, [h("option", { value: "chat" }, "聊天"), h("option", { value: "work" }, "协作任务（先分工后执行）")]),
                    h("label", null, [h("input", { type: "checkbox", checked: group?.allowAgentManagement === true, disabled: state.busy || !group, onChange: event => void api.command({ op: "setGroupOptions", groupId: group.id, allowAgentManagement: event.target.checked }).catch(() => {}) }), "允许机器人管理"]),
                    h("label", null, [h("input", { type: "checkbox", checked: includeMain, onChange: (event) => setIncludeMain(event.target.checked) }), "带入主对话"]),
                    h("button", { type: "button", className: "gc-btn gc-btn-small", disabled: state.busy || sending || !group || !draft.trim(), onClick: () => void operation("planTasks") }, "拆分并协作"),
                    h("button", { type: "button", className: "gc-btn gc-btn-small", disabled: state.busy || sending || !group, onClick: () => void operation("executeTasks") }, "执行任务板"),
                    h("button", { type: "button", className: "gc-btn gc-btn-small", disabled: state.busy || sending || !group, onClick: () => void operation("summarizeMemory") }, "整理记忆"),
                    group?.hostContext && h("button", { type: "button", className: "gc-btn gc-btn-small", disabled: state.busy || sending, onClick: () => void api.command({ op: "setHostContext", groupId: group.id, context: "" }).catch(() => {}) }, "清除带入背景"),
                ]),
				mention !== null && (suggestions.length > 0 || externalSuggestions.length > 0) && h("div", { className: "gc-mention-pop" }, [
                    suggestions.length > 0 && h("div", { className: "gc-mention-heading" }, "本群成员"),
                    ...suggestions.map((member, index) => h("button", { key: member.id, type: "button", className: index === 0 ? "gc-mention-item gc-mention-item-active" : "gc-mention-item",
                        onMouseDown: (event) => { event.preventDefault(); applyMention(member.name); } }, [Avatar({ member, size: 20 }), h("span", null, member.name), h("small", { className: "gc-mention-description" }, member.persona?.split("\n")[0].slice(0, 60) || member.model)])),
                    ...externalSuggestions.map(({ group: source, members: candidates }) => h("div", { key: source.id }, [
                        h("div", { className: "gc-mention-heading" }, `外群：${source.name}`),
                        ...candidates.map((member) => h("button", { key: member.id, type: "button", className: "gc-mention-item", onMouseDown: (event) => { event.preventDefault(); void applyExternalMention(source, member); } }, [Avatar({ member, size: 20 }), h("span", null, member.name), h("small", { className: "gc-mention-description" }, member.persona?.split("\n")[0].slice(0, 80) || "尚未填写职责描述")])),
                    ])),
                    h("button", { type: "button", className: "gc-mention-item", onMouseDown: (event) => { event.preventDefault(); applyMention(t("composer.mentionAll")); } }, "@所有人（本群）"),
                ]),
				h("div", { className: "gc-composer-box" }, [
					h("textarea", {
						ref: textRef,
						className: "gc-composer-input",
						rows: 1,
						value: draft,
						placeholder: loading ? t("view.loading") : t("composer.placeholder"),
						disabled: group === void 0,
						onChange: (event) => onChange(event.target.value),
						onKeyDown,
					}),
					state.busy
						? h("button", { type: "button", className: "gc-btn gc-btn-danger", onClick: () => { if (group !== void 0) void api.command({ op: "stopTurn", groupId: group.id }).catch(() => {}); } }, t("composer.stop"))
						: h("button", { type: "button", className: "gc-btn gc-btn-primary", disabled: sending || draft.trim() === "" || group === void 0, onClick: event => { event.preventDefault(); event.stopPropagation(); void submit(); } }, sending ? "发送中…" : group?.workMode ? "开始协作" : t("composer.send")),
				]),
			]);
		}

		// ---------------------------------------------------------------------
		// CSS
		// ---------------------------------------------------------------------
		const CSS = `
.gc-sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.gc-copy-btn{display:inline-flex;align-items:center;justify-content:center;min-width:24px;min-height:24px}

.gc-theme{--gc-surface:var(--gc-solid);--gc-soft:var(--gc-solid);--gc-text:var(--gc-ink);--gc-border:#94a3b866;--gc-muted:var(--gc-ink)}
.gc-theme,.gc-view{--gc-solid:#ffffff;--gc-ink:#202938}
@media(prefers-color-scheme:dark){.gc-theme,.gc-view{--gc-solid:#20252f;--gc-ink:#eef2f8}}
[data-theme="dark"] .gc-theme,[data-theme="dark"] .gc-view,.dark .gc-theme,.dark .gc-view{--gc-solid:#20252f;--gc-ink:#eef2f8}
[data-theme="light"] .gc-theme,[data-theme="light"] .gc-view{--gc-solid:#ffffff;--gc-ink:#202938}
.gc-settings{padding:20px;color:var(--gc-ink);background:var(--gc-solid);border-radius:18px;max-width:780px;font-size:13px}
.gc-setting-row{display:grid;grid-template-columns:1fr minmax(90px,240px);gap:10px;padding:14px 0;border-bottom:1px solid #94a3b833;align-items:center}
.gc-setting-row small{grid-column:1/-1;opacity:.8;line-height:1.6}
.gc-settings .gc-input{background:var(--gc-solid);color:var(--gc-ink);width:100%}
.gc-settings p{line-height:1.7}

#dsh-groupchat-style{all:initial}
.gc-view{display:flex;flex-direction:column;flex:1 1 0;min-width:0;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary,#18181b);font-size:13px}
.gc-view *{box-sizing:border-box}
/* Anchor against the resident viewport, independent of session wrappers and late host CSS. */
[data-gc-host="beta.8"]{position:relative!important;overflow:hidden!important;min-height:0!important;isolation:isolate}
[data-gc-host="beta.8"] [data-gc-bridge="beta.8"][data-gc-bridge]{position:static!important;contain:none!important;transform:none!important;filter:none!important;perspective:none!important}
[data-gc-host="beta.8"] .gc-view[data-gc-anchored="beta.8"]{position:absolute!important;top:0!important;left:0!important;right:0!important;bottom:auto!important;height:var(--gc-host-height,100%)!important;max-height:100%!important;margin:0!important;z-index:1}
[data-gc-host="beta.8"]>[data-composer-seat]{display:none!important}
/* The plugin owns its input inside the same flex column as messages. The
   host chain remains an empty suppression seat; no geometry depends on it. */
[data-conversation-scroll]:has(.gc-view)>[data-composer-seat]{display:none}
[data-conversation-scroll]:has(.gc-view){overflow:hidden;min-height:0}
.gc-version{font-size:10px;opacity:.7;white-space:nowrap}
.gc-default-hint{padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-secondary,#52525b)}
@media(max-width:600px){.gc-main{position:relative}.gc-panel{position:absolute;right:0;top:0;bottom:0;width:min(264px,100%);z-index:2;background:var(--dsw-alias-bg-base,#fff)}.gc-top-actions{flex-wrap:wrap}.gc-msg-stack{max-width:85%}}
.gc-error-boundary{flex:auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;color:var(--dsw-alias-state-error-primary,#e5484d)}
.gc-error-title{font-weight:600;font-size:14px}
.gc-error-detail{font-size:12px;color:var(--dsw-alias-label-secondary,#52525b);white-space:pre-wrap;word-break:break-all;max-width:520px}
.gc-topbar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#e4e4e7);flex-wrap:wrap}
.gc-groups{display:flex;align-items:center;gap:6px;flex:1;min-width:0;flex-wrap:wrap}
.gc-group-chip{border:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:var(--dsw-alias-bg-layer-1,#f7f7f8);color:var(--dsw-alias-label-secondary,#52525b);border-radius:999px;padding:3px 12px;font-size:12px;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gc-group-chip:hover{background:var(--dsw-alias-interactive-bg-hover,#efeff1)}
.gc-group-chip-active{background:var(--dsw-alias-brand-primary,#4d7bfe);color:#fff;border-color:transparent}
.gc-group-chip-add{color:var(--dsw-alias-brand-primary,#4d7bfe)}
.gc-top-actions{display:flex;align-items:center;gap:6px}
.gc-main{display:flex;flex:1 1 0;min-height:0;overflow:hidden}
.gc-chat{flex:1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column}
.gc-messages{flex:auto;min-height:0;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.gc-center{flex:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--dsw-alias-label-dimmed,#a1a1aa);gap:8px;padding:24px;text-align:center}
.gc-welcome-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#a1a1aa)}
.gc-msg-row{display:flex;gap:8px;max-width:100%}
.gc-msg-user{justify-content:flex-end}
.gc-msg-member{align-items:flex-start}
.gc-msg-stack{display:flex;flex-direction:column;gap:3px;max-width:min(72%,680px)}
.gc-msg-user .gc-msg-stack{align-items:flex-end}
.gc-msg-meta{display:flex;align-items:baseline;gap:6px;font-size:11px;color:var(--dsw-alias-label-dimmed,#a1a1aa);padding:0 4px}
.gc-msg-name{font-weight:600;color:var(--dsw-alias-label-secondary,#52525b)}
.gc-msg-model{background:var(--dsw-alias-bg-layer-2,#ececee);border-radius:4px;padding:0 5px;font-size:10px}
.gc-msg-typing{color:var(--dsw-alias-brand-primary,#4d7bfe)}
.gc-bubble{border-radius:12px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:var(--dsw-alias-bg-layer-1,#f7f7f8);max-width:100%;word-break:break-word}
.gc-bubble-user{background:var(--dsw-alias-brand-primary,#4d7bfe);color:#fff;border-color:transparent;border-top-right-radius:4px}
.gc-bubble-member{border-top-left-radius:4px;background:color-mix(in srgb,var(--gc-member-color,#4d7bfe) 14%,var(--dsw-alias-bg-layer-1,#f7f7f8));border-color:color-mix(in srgb,var(--gc-member-color,#4d7bfe) 42%,var(--dsw-alias-border-l1,#e4e4e7))}
.gc-bubble-error{border-color:var(--dsw-alias-state-error-primary,#e5484d)}
.gc-bubble-text{white-space:pre-wrap;line-height:1.55;font-size:13px}
.gc-mention{color:var(--dsw-alias-brand-primary,#4d7bfe);font-weight:600}
.gc-bubble-user .gc-mention{color:#fff;text-decoration:underline}
.gc-mention-pop{max-height:280px;overflow-y:auto}.gc-mention-heading{font-size:11px;font-weight:600;padding:6px 9px;opacity:.7}.gc-mention-description{font-size:11px;opacity:.6;margin-left:auto;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gc-external-picker summary{cursor:pointer;margin-bottom:6px}.gc-external-item{display:flex;flex-direction:column;text-align:left;gap:3px;width:100%;background:transparent;border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:6px;padding:6px;margin:4px 0;color:inherit;cursor:pointer}.gc-external-item small{opacity:.65}
.gc-avatar-status{position:relative;display:inline-flex;flex:none}.gc-connection-dot{position:absolute;right:-2px;bottom:-1px;width:9px;height:9px;border-radius:50%;border:2px solid var(--dsw-alias-bg-base,#fff);background:#94a3b8}.gc-connection-connected{background:#22c55e}.gc-connection-error{background:#ef4444}.gc-connection-success{color:#16803b;font-size:11px}.gc-group-title{font-weight:600;padding:4px 8px}
.gc-avatar{border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none;overflow:hidden;color:#fff;font-size:14px}
.gc-avatar img{width:100%;height:100%;object-fit:cover}
.gc-avatar-emoji{line-height:1;font-size:0.62em;transform:scale(1.6)}
.gc-typing-dots{display:flex;gap:3px;align-items:center;height:30px;padding:0 2px}
.gc-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-dimmed,#a1a1aa);animation:gc-blink 1.2s infinite}
@keyframes gc-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.gc-typing-label{align-self:center;font-size:12px;color:var(--dsw-alias-label-dimmed,#a1a1aa)}
.gc-sys-row{display:flex;justify-content:center}
.gc-sys-chip{background:var(--dsw-alias-bg-layer-2,#ececee);color:var(--dsw-alias-label-dimmed,#a1a1aa);border-radius:999px;padding:2px 12px;font-size:11px}
.gc-panel{width:264px;flex:none;border-left:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:var(--dsw-alias-bg-base,transparent);overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:12px;position:relative}
.gc-panel-section{display:flex;flex-direction:column;gap:6px}
.gc-panel-head{display:flex;align-items:center;justify-content:space-between}
.gc-panel-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#52525b)}
.gc-panel-empty{font-size:12px;color:var(--dsw-alias-label-dimmed,#a1a1aa);margin:4px 0}
.gc-member-list,.gc-task-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.gc-member-row{display:flex;align-items:center;gap:8px;padding:4px;border-radius:8px}
.gc-member-row:hover{background:var(--dsw-alias-interactive-bg-hover,#efeff1)}
.gc-member-meta{flex:1;min-width:0}
.gc-member-name{font-size:12.5px;font-weight:600}
.gc-member-model{font-size:11px;color:var(--dsw-alias-label-dimmed,#a1a1aa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gc-task-row{display:flex;gap:8px;padding:6px;border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#f7f7f8)}
.gc-task-row.gc-task-completed{opacity:.62}
.gc-task-toggle{background:none;border:none;cursor:pointer;font-size:14px;color:var(--dsw-alias-state-success-primary,#30a46c);padding:0;flex:none}
.gc-task-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.gc-task-title{font-size:12.5px;word-break:break-word}
.gc-task-meta{display:flex;align-items:center;gap:6px}
.gc-task-select{font-size:11px;border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:6px;background:var(--dsw-alias-bg-base,transparent);color:inherit;max-width:110px;padding:1px 4px}
.gc-task-status{font-size:11px;border:none;background:none;color:var(--dsw-alias-label-dimmed,#a1a1aa);cursor:pointer;padding:0}
.gc-task-status:hover{color:var(--dsw-alias-brand-primary,#4d7bfe)}
.gc-panel-close{margin-top:auto;border:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:none;border-radius:8px;padding:4px;cursor:pointer;color:var(--dsw-alias-label-dimmed,#a1a1aa)}
.gc-memory-foot{display:flex;align-items:center;justify-content:space-between;gap:6px}
.gc-memory-hint{font-size:11px;color:var(--dsw-alias-label-dimmed,#a1a1aa)}
.gc-row{display:flex;align-items:center;gap:6px}
.gc-row-end{justify-content:flex-end}
.gc-btn{border:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:var(--dsw-alias-bg-layer-1,#f7f7f8);color:var(--dsw-alias-label-primary,#18181b);border-radius:8px;padding:5px 12px;font-size:12.5px;cursor:pointer}
.gc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#efeff1)}
.gc-btn:disabled{opacity:.5;cursor:default}
.gc-btn-primary{background:var(--dsw-alias-brand-primary,#4d7bfe);color:#fff;border-color:transparent}
.gc-btn-primary:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#4d7bfe))}
.gc-btn-danger{background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff;border-color:transparent}
.gc-btn-small{padding:3px 9px;font-size:11.5px}
.gc-icon-btn{border:none;background:none;cursor:pointer;color:var(--dsw-alias-label-dimmed,#a1a1aa);font-size:13px;padding:2px 4px;border-radius:6px}
.gc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#efeff1);color:var(--dsw-alias-label-primary,#18181b)}
.gc-icon-btn-brand{color:var(--dsw-alias-brand-primary,#4d7bfe);font-size:15px;font-weight:700}
.gc-input{border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:8px;padding:6px 9px;font-size:12.5px;background:var(--dsw-alias-bg-base,transparent);color:inherit;width:100%;min-width:0}
.gc-input:focus{outline:2px solid var(--dsw-alias-brand-primary,#4d7bfe);outline-offset:-1px}
.gc-textarea{resize:vertical;line-height:1.5}
.gc-input-color{width:44px;height:30px;padding:2px;cursor:pointer}
.gc-input-avatar{flex:1}
.gc-avatar-row{display:flex;flex-direction:column;gap:6px}
.gc-avatar-current{display:flex;align-items:center}
.gc-avatar-upload-row{display:flex;align-items:center;gap:6px}
.gc-avatar-presets{display:flex;flex-wrap:wrap;gap:4px}
.gc-avatar-preset{border:1px solid var(--dsw-alias-border-l1,#e4e4e7);background:var(--dsw-alias-bg-layer-1,#f7f7f8);border-radius:8px;cursor:pointer;font-size:16px;padding:3px 5px}
.gc-avatar-preset-active{border-color:var(--dsw-alias-brand-primary,#4d7bfe);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary,#4d7bfe)}
.gc-form{display:flex;flex-direction:column;gap:10px}
.gc-field{display:flex;flex-direction:column;gap:4px}
.gc-field-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#52525b)}
.gc-field-check{flex-direction:row;align-items:center;gap:6px}
.gc-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gc-notice{font-size:11.5px;color:var(--dsw-alias-state-warn-primary,#f0a020);line-height:1.5}
.gc-notice-error{color:var(--dsw-alias-state-error-primary,#e5484d)}
.gc-banner{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff;padding:6px 12px;font-size:12.5px}
.gc-banner-warn{background:var(--dsw-alias-state-warn-primary,#f0a020)}
.gc-banner .gc-icon-btn{color:#fff}
.gc-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000;padding:24px}
.gc-import-modal{width:min(480px,100%);padding:22px;gap:12px}.gc-import-modal h3,.gc-import-modal p{margin:0}.gc-top-actions{flex-wrap:wrap;max-width:100%}
.gc-modal{background:var(--gc-surface);color:var(--gc-text);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1,#e4e4e7)}
.gc-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#e4e4e7)}
.gc-modal-title{font-weight:600;font-size:14px}
.gc-modal-body{padding:16px;overflow-y:auto}
.gc-confirm-text{font-size:13px;color:var(--dsw-alias-label-secondary,#52525b);margin:0 0 14px;line-height:1.6}
.gc-composer{position:relative;padding:8px 12px;background:var(--dsw-alias-bg-base,#fff);flex:none}
.gc-composer-box{display:flex;align-items:flex-end;gap:8px;border:1px solid var(--dsw-alias-border-l2,#d4d4d8);border-radius:12px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#f7f7f8)}
.gc-composer-input{flex:1;border:none;background:none;resize:none;font-size:13px;line-height:1.5;color:inherit;max-height:140px;outline:none;font-family:inherit}
.gc-mention-pop{position:absolute;bottom:calc(100% + 2px);left:16px;z-index:50;background:var(--gc-surface);color:var(--gc-text);border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.16);padding:4px;display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;min-width:220px}
.gc-mention-item{display:flex;align-items:center;gap:8px;border:none;background:none;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12.5px;color:inherit;text-align:left}
.gc-mention-item:hover,.gc-mention-item-active{background:var(--dsw-alias-interactive-bg-hover,#efeff1)}
.gc-mention-model{font-size:10.5px;color:var(--dsw-alias-label-dimmed,#a1a1aa);margin-left:auto}
.gc-markdown{font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.gc-markdown p{margin:0 0 6px;white-space:pre-wrap}.gc-markdown p:last-child{margin-bottom:0}
.gc-markdown h1,.gc-markdown h2,.gc-markdown h3,.gc-markdown h4,.gc-markdown h5,.gc-markdown h6{font-size:1.12em;line-height:1.4;margin:10px 0 6px}.gc-markdown h1{font-size:1.4em}
.gc-markdown ul,.gc-markdown ol{padding-left:22px;margin:3px 0}
.gc-markdown blockquote{border-left:3px solid var(--gc-member-color,#9aa9c2);margin:6px 0;padding-left:10px;opacity:.85}
.gc-markdown :not(pre)>code{background:color-mix(in srgb,currentColor 9%,transparent);padding:1px 4px;border-radius:4px;font-size:.94em}
.gc-markdown a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.gc-code-block{max-width:100%;min-width:0;background:#172033;color:#e5edf8;border-radius:9px;overflow:hidden;margin:8px 0;border:1px solid #34435c}
.gc-code-head{display:flex;justify-content:space-between;align-items:center;padding:5px 10px;background:#25324a;font-size:11px;color:#bfcde2}
.gc-code-block pre{margin:0;padding:12px;overflow-x:auto;white-space:pre;line-height:1.65;tab-size:4;font-size:12px}.gc-code-block code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.gc-copy-btn{font:inherit;font-size:10px;cursor:pointer;border:0;border-radius:4px;background:transparent;color:inherit;padding:2px 5px;opacity:.7;white-space:nowrap}.gc-copy-btn:hover,.gc-copy-btn:focus-visible{opacity:1;background:color-mix(in srgb,currentColor 10%,transparent)}
.gc-table-scroll{max-width:100%;overflow-x:auto;margin:8px 0}.gc-markdown table{border-collapse:collapse;font-size:12px}.gc-markdown td,.gc-markdown th{border:1px solid color-mix(in srgb,currentColor 22%,transparent);padding:6px 9px;text-align:left;min-width:65px}.gc-markdown th{background:color-mix(in srgb,currentColor 7%,transparent)}
.gc-msg-row{animation:gc-enter .16s ease-out}.gc-markdown-streaming::after{content:"";display:inline-block;width:5px;height:12px;background:currentColor;opacity:.5;margin-left:4px;animation:gc-blink 1.2s infinite}
@keyframes gc-enter{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.gc-msg-row,.gc-markdown-streaming::after,.gc-dot{animation:none!important}}
.gc-member-memory{border:1px solid var(--dsw-alias-border-l1,#e4e4e7);border-radius:8px;padding:8px}.gc-member-memory summary{font-weight:600;cursor:pointer;margin-bottom:6px}.gc-memory-note{padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1,#e4e4e7);white-space:pre-wrap;font-size:11px;line-height:1.5}.gc-memory-note small{opacity:.6}
.gc-sys-chip{white-space:pre-wrap;line-height:1.6;border-radius:10px;max-width:85%}


.gc-view{--gc-surface:var(--dsw-alias-bg-base,#ffffff);--gc-soft:var(--dsw-alias-bg-layer-1,#f5f7fb);--gc-text:var(--dsw-alias-label-primary,#202938);--gc-muted:var(--dsw-alias-label-secondary,#5b687b);--gc-border:var(--dsw-alias-border-l1,#dce3ee);background:transparent;color:var(--gc-text)}
@media(prefers-color-scheme:dark){.gc-view{--gc-surface:var(--dsw-alias-bg-base,#202633);--gc-soft:var(--dsw-alias-bg-layer-1,#292f3e);--gc-text:var(--dsw-alias-label-primary,#edf1f8);--gc-muted:var(--dsw-alias-label-secondary,#b6c0d0);--gc-border:var(--dsw-alias-border-l1,#424c60)}}
html[data-theme="light"] .gc-view{--gc-surface:var(--dsw-alias-bg-base,#fff);--gc-soft:var(--dsw-alias-bg-layer-1,#f5f7fb);--gc-text:var(--dsw-alias-label-primary,#202938);--gc-muted:var(--dsw-alias-label-secondary,#5b687b);--gc-border:var(--dsw-alias-border-l1,#dce3ee)}
html[data-theme="dark"] .gc-view,.dark .gc-view{--gc-surface:var(--dsw-alias-bg-base,#202633);--gc-soft:var(--dsw-alias-bg-layer-1,#292f3e);--gc-text:var(--dsw-alias-label-primary,#edf1f8);--gc-muted:var(--dsw-alias-label-secondary,#b6c0d0);--gc-border:var(--dsw-alias-border-l1,#424c60)}
.gc-topbar{padding:10px 14px;gap:10px;background:var(--gc-surface);border-color:var(--gc-border)}
.gc-group-title{font-size:14px;letter-spacing:.2px}.gc-version{opacity:1;color:var(--gc-muted)}
.gc-messages{padding:22px 20px;gap:18px;background:var(--gc-soft)}
.gc-bubble{padding:12px 15px;border-radius:18px;line-height:1.65;box-shadow:0 2px 5px #10182808}
.gc-bubble-member{background:color-mix(in srgb,var(--gc-member-color,#4d7bfe) 10%,var(--gc-surface));border-color:color-mix(in srgb,var(--gc-member-color,#4d7bfe) 25%,var(--gc-border));border-top-left-radius:6px}
.gc-bubble-user{border-top-right-radius:6px}.gc-msg-meta{color:var(--gc-muted);gap:8px;margin-bottom:3px}
.gc-panel{background:var(--gc-surface);border-color:var(--gc-border);padding:14px;gap:16px}
.gc-member-row{padding:8px;border-radius:12px}.gc-member-row:hover{background:var(--gc-soft)}
.gc-task-row{background:var(--gc-soft);border-color:var(--gc-border);border-radius:12px;padding:10px}
.gc-btn{border-color:var(--gc-border);border-radius:10px;padding:7px 12px;background:var(--gc-soft);color:var(--gc-text);transition:background .15s,box-shadow .15s}
.gc-btn:hover{background:var(--gc-surface);box-shadow:0 2px 8px #10182812}.gc-btn-primary{background:#456de3;color:#fff;border-color:#456de3}.gc-btn-primary:hover{background:#355bc9}.gc-btn-danger{background:#cc3847;color:#fff}
.gc-input,.gc-task-select{background:var(--gc-soft);color:var(--gc-text);border-color:var(--gc-border);border-radius:10px;padding:8px 10px}
.gc-input:focus-visible{outline:2px solid #6285f0;outline-offset:1px}.gc-input option,.gc-task-select option{background:var(--gc-surface);color:var(--gc-text)}
.gc-modal{border-radius:20px;border-color:var(--gc-border);width:min(520px,100%);max-width:100%;box-shadow:0 24px 80px #00000040}
.gc-modal-head{padding:17px 20px;border-color:var(--gc-border);background:var(--gc-surface)}.gc-modal-title{font-size:16px}.gc-modal-body{padding:20px;background:var(--gc-surface)}
.gc-modal-backdrop{background:#00000066}.gc-modal label,.gc-modal .gc-field-label{color:var(--gc-text)}
.gc-mention-pop{border-radius:14px;border-color:var(--gc-border);box-shadow:0 12px 36px #10182828;padding:6px;max-width:calc(100% - 32px)}
.gc-mention-item{padding:9px 10px;border-radius:9px;color:var(--gc-text)}.gc-mention-item:hover,.gc-mention-item-active{background:var(--gc-soft)}
.gc-mention-heading,.gc-mention-description{opacity:1;color:var(--gc-muted)}
.gc-composer{padding:12px 16px;background:var(--gc-surface)}.gc-composer-box{background:var(--gc-soft);border-color:var(--gc-border);border-radius:18px;padding:11px 13px;box-shadow:0 3px 14px #10182808}
.gc-composer-input{color:var(--gc-text)}
.gc-avatar-preset{background:var(--gc-soft);color:var(--gc-text);border-color:var(--gc-border);border-radius:9px}
.gc-memory-hint,.gc-field-hint,.gc-member-model,.gc-panel-empty,.gc-mention-model{color:var(--gc-muted)}
.gc-input::placeholder,.gc-composer-input::placeholder{color:var(--gc-muted);opacity:1}
.gc-member-memory{border-color:var(--gc-border);border-radius:12px}
@media(max-width:600px){.gc-messages{padding:14px 10px}.gc-panel{background:var(--gc-surface)}.gc-modal-backdrop{padding:12px}.gc-modal-body{padding:16px}.gc-composer{padding:10px}}
@media(prefers-reduced-motion:reduce){.gc-btn{transition:none}}

.gc-view>.gc-main{display:flex!important;flex:1 1 0!important;min-height:0!important;min-width:0!important;order:2!important}
.gc-view>.gc-main>.gc-chat{display:flex!important;flex:1 1 0!important;min-height:0!important;min-width:0!important;flex-direction:column!important}
.gc-view .gc-messages{flex:1 1 0!important;min-height:0!important;overflow-y:auto!important;background:transparent}
.gc-view>.gc-composer{flex:0 0 auto!important;position:relative!important;order:3!important;align-self:stretch!important;background:transparent}
.gc-view>.gc-topbar{flex:0 0 auto!important;order:1!important;background:transparent}
.gc-panel-shell{position:relative;display:flex;flex:none;width:min(var(--gc-panel-width,320px),55%);min-width:240px;min-height:0}
.gc-panel-shell>.gc-panel{width:100%;min-width:0;height:100%;overflow-y:auto}
.gc-panel-resize{position:absolute;left:-4px;top:0;bottom:0;width:9px;z-index:5;cursor:col-resize;touch-action:none}
.gc-panel-resize:hover,.gc-panel-resize:focus-visible{background:#6285f04d;outline:none}
.gc-panel[data-panel="members"] [data-gc-section]:not([data-gc-section="members"]),.gc-panel[data-panel="tasks"] [data-gc-section]:not([data-gc-section="tasks"]),.gc-panel[data-panel="memory"] [data-gc-section]:not([data-gc-section="memory"]){display:none}
.gc-view .gc-modal,.gc-view .gc-mention-pop{background-color:var(--gc-surface);background-image:linear-gradient(var(--gc-surface),var(--gc-surface)),linear-gradient(#fff,#fff)}
@media(max-width:600px){.gc-panel-shell{position:absolute;right:0;top:0;bottom:0;z-index:4;width:min(var(--gc-panel-width,320px),90%);min-width:0}.gc-panel-shell>.gc-panel{position:static;width:100%}}
.gc-bubble-member{background:color-mix(in srgb,color-mix(in srgb,var(--gc-member-color,#456de3) 13%,var(--gc-solid)) var(--gc-bubble-alpha,100%),transparent);color:var(--gc-ink)}
.gc-bubble-user{background:color-mix(in srgb,var(--gc-user-color,#456de3) var(--gc-bubble-alpha,100%),transparent);color:#fff}
.gc-mode-select{max-width:none;width:240px;min-width:200px;font-size:12px;padding:8px 32px 8px 12px;border-radius:12px;background-color:var(--gc-solid);color:var(--gc-ink);cursor:pointer}
.gc-mode-select option{background:var(--gc-solid);color:var(--gc-ink)}

`;

		// ---------------------------------------------------------------------
		// registration
		// ---------------------------------------------------------------------
		const inject = ["slots", "locale", "sessions"];

		function apply(ctx) {
            recordDiagnostic("apply-start");
            if (typeof window.addEventListener === "function") {
                const onError = (event) => recordDiagnostic("window-error", safeError(event.error));
                const previousConsoleError = console.error;
                const captureConsoleError = (...args) => { for (const value of args) if (value && typeof value === "object" && (value.stack || value.name === "Error")) recordDiagnostic("console-error", safeError(value)); previousConsoleError.apply(console, args); };
                console.error = captureConsoleError;
                ctx.effect(() => () => { if (console.error === captureConsoleError) console.error = previousConsoleError; });
                const onRejected = (event) => recordDiagnostic("unhandled-rejection", safeError(event.reason));
                window.addEventListener("error", onError); window.addEventListener("unhandledrejection", onRejected);
                ctx.effect(() => () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejected); recordDiagnostic("apply-dispose"); });
            }
            if (typeof document !== "undefined") {
                const outlet = document.createElement("div"); outlet.id = "dsh-groupchat-emergency";
                outlet.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483646;display:flex;gap:6px;font:12px system-ui;";
                const button = document.createElement("button"); button.type = "button"; button.textContent = "群聊诊断"; button.title = "导出诊断（Ctrl+Alt+Shift+D），不依赖群聊视图";
                button.style.cssText = "border:1px solid #94a3b8;border-radius:10px;background:#fff;color:#202938;padding:7px 10px;cursor:pointer;box-shadow:0 2px 12px #0002";
                const exportNow = () => { try { downloadDiagnostics(document.querySelector(".gc-view"), store.getSnapshot().viewSessionId); } catch (error) { button.textContent = "导出失败，请读取诊断文件"; recordDiagnostic("emergency-export-failed", safeError(error)); } };
                button.addEventListener("click", exportNow); outlet.appendChild(button); document.body.appendChild(outlet);
                const updateOutlet = () => { const view = document.querySelector(".gc-view"); outlet.style.display = view && view.getBoundingClientRect().height > 100 && getComputedStyle(view).visibility !== "hidden" ? "none" : "flex"; };
                const keyHandler = event => { if (event.ctrlKey && event.altKey && event.shiftKey && event.code === "KeyD") { event.preventDefault(); event.stopImmediatePropagation(); exportNow(); } };
                window.addEventListener("keydown", keyHandler, true);
                let lastSent = "", flight = null;
                const flush = () => {
                    updateOutlet();
                    const latest = `${bootLog.length}:${bootLog[bootLog.length - 1]?.time}:${bootLog[bootLog.length - 1]?.event}`;
                    if (!latest || latest === lastSent || flight) return;
                    lastSent = latest; const abort = new AbortController(); flight = abort;
                    const timeout = setTimeout(() => abort.abort(), 3000);
                    void fetch("/groupchat/diagnostics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "1.1.0-beta.8", bootLog: bootLog.slice(-40), history: layoutHistory.slice(-4), viewport: { width: innerWidth, height: innerHeight } }), signal: abort.signal }).then(response => { if (!response.ok) lastSent = ""; }).catch(() => { lastSent = ""; }).finally(() => { clearTimeout(timeout); flight = null; });
                };
                const timer = setInterval(flush, 4000); updateOutlet();
                const navigation = event => {
                    const target = event.target?.closest?.("button,[role='tab'],a"); if (!target || target.closest(".gc-view,#dsh-groupchat-emergency")) return;
                    recordDiagnostic("host-navigation-click", { role: target.getAttribute("role"), className: String(target.className).slice(0,120), sessionId: document.querySelector("[data-conversation-session]")?.getAttribute("data-conversation-session") ?? null });
                };
                document.addEventListener("click", navigation, true);
                ctx.effect(() => () => { clearInterval(timer); flight?.abort(); outlet.remove(); window.removeEventListener("keydown", keyHandler, true); document.removeEventListener("click", navigation, true); });
            }
			// Continue sampling after leaving group chat, including blank/new native sessions.
            if (typeof document !== "undefined") {
                let signature = "";
                const sampleNative = () => {
                    const inputs = [...document.querySelectorAll("textarea,[contenteditable='true']")].filter(el => !el.closest(".gc-view") && el.getClientRects().length);
                    const geometry = inputs.map(el => { const rect = el.getBoundingClientRect(); const css = getComputedStyle(el); return { top: Math.round(rect.top), height: Math.round(rect.height), position: css.position, phase: el.closest("[data-phase]")?.getAttribute("data-phase"), ancestors: (() => { const list = []; for (let parent = el.parentElement; parent && list.length < 8; parent = parent.parentElement) { const r = parent.getBoundingClientRect(), c = getComputedStyle(parent); list.push({ className: String(parent.className), top: Math.round(r.top), height: Math.round(r.height), flex: c.flex, position: c.position, display: c.display }); } return list; })() }; });
                    const key = JSON.stringify(geometry); if (key !== signature) { signature = key; recordDiagnostic("native-layout-change", { inputs: geometry, groupViews: document.querySelectorAll(".gc-view").length }); }
                };
                const timer = setInterval(sampleNative, 750); sampleNative();
                ctx.effect(() => () => clearInterval(timer));
            }
            // CSS
			let styleNode = null;
			if (typeof document !== "undefined") {
				styleNode = document.createElement("style");
				styleNode.id = "dsh-groupchat-style";
				styleNode.textContent = CSS;
				document.head.appendChild(styleNode);
			}
			ctx.effect(() => () => {
				styleNode?.remove();
			}, "dsh-groupchat: styles");

			// locale
            recordDiagnostic("locale-register-start");
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-groupchat: dictionaries");
            recordDiagnostic("locale-registered");

			const api = createApi(store);
			const apiRef = { current: api };
			// 供视图与输入框组件使用的注入 props
			const resolveMainModelSource = (sessionId) => {
				try {
					const directories = ctx.get?.("modelDirectories");
					if (directories?.directoryFor && sessionId !== undefined) return directories.directoryFor(sessionId).store;
					return ctx.sessions?.binding?.(sessionId)?.session.projections?.faceOf?.("modelSelection") ?? ABSENT_MODEL_SOURCE;
				} catch { return ABSENT_MODEL_SOURCE; }
			};
			const loadMainModel = (sessionId) => {
				try { void ctx.get?.("modelDirectories")?.directoryFor(sessionId)?.load().catch(() => {}); } catch {}
			};
			const readHostContext = (sessionId) => hostContextOf(ctx.sessions?.binding?.(sessionId));
            const readHostMessages = (sessionId) => hostMessagesOf(ctx.sessions?.binding?.(sessionId));
            const readSessionTitle = (sessionId) => ctx.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.title;
            const viewInject = () => ({ api: apiRef.current, resolveMainModelSource, loadMainModel, readHostContext, readHostMessages, readSessionTitle });
			// The model selector may finish loading after this plugin. Wake mounted views
			// when its public directory service arrives, without making it a hard dependency.
            if (typeof ctx.inject === "function") {
                try { ctx.inject(["modelDirectories"], () => { store.update((draft) => { draft.modelSourceRevision += 1; }); }); }
                catch (error) { recordDiagnostic("model-directory-injection-failed", safeError(error)); console.warn("[dsh-groupchat] optional model directory unavailable", error); }
            }

			// 数据加载与 SSE 订阅放到 apply 层（全局生命周期），不随视图挂载/卸载重建，
			// 避免会话切换时 activeGroupId 被卸载清理清空导致的“点击无响应/空白”。
			let eventsClose = null;
			let eventsGroupId = null;
			const syncEvents = () => {
				const groupId = store.getSnapshot().activeGroupId;
				if (groupId === eventsGroupId) return;
				if (eventsClose !== null) {
					eventsClose();
					eventsClose = null;
					eventsGroupId = null;
				}
				if (groupId === null) return;
				// Set identity BEFORE store notifications from stream setup (sync store).
				eventsGroupId = groupId;
				store.update((draft) => { draft.busy = false; draft.typing = []; draft.responders = []; draft.connected = false; });
				eventsClose = api.openEvents(groupId);
			};
			const disposeEvents = store.subscribe(syncEvents);
			syncEvents();
			ctx.effect(() => () => {
				disposeEvents();
				if (eventsClose !== null) eventsClose();
				api.dispose();
			}, "dsh-groupchat: events lifecycle");

			void (async () => {
				try {
					await api.refresh();
					void api.refreshCatalog();
					// Each mounted conversation view ensures its own session group.
				} catch (error) {
					store.update((draft) => {
						draft.error = error instanceof Error ? error.message : String(error);
					});
				}
			})();

			// Register a neutral builder. DSH activity targets are monotonic per binding;
            // external group history must never promote native blank sessions.
            const registeredViews = new WeakSet();
            const optionalFailure = (error) => {
                recordDiagnostic("target-registration-failed", safeError(error));
                console.warn("[dsh-groupchat beta.8] optional conversation registration failed", error);
                store.update((draft) => { draft.error = `群聊视图兼容注册失败：${error instanceof Error ? error.message : String(error)}。可导出诊断；其他插件可继续启动。`; });
            };
            const registerTarget = (owner) => {
                try {
                    const conversation = owner.get?.("uiConversation") ?? owner.uiConversation;
                    const views = conversation?.views;
                    if (views?.entries?.().some(definition => definition.target === "group-chat")) { recordDiagnostic("target-already-present"); return; }
                    if (typeof views?.register !== "function" || registeredViews.has(views)) return;
                    owner.effect(() => {
                        try {
                            const inactive = Object.freeze({ ready: false });
                            // Group history is external to the host event assembler. It must not
                            // mark a native blank session permanently active after tab changes.
                            const dispose = views.register({
                                target: "group-chat",
                                create: () => ({ empty: inactive, replace: () => inactive, apply: () => inactive }),
                                isActive: (snapshot) => snapshot?.ready === true,
                            });
                            registeredViews.add(views); recordDiagnostic("target-registered");
                            return () => { registeredViews.delete(views); recordDiagnostic("target-disposed"); if (typeof dispose === "function") dispose(); };
                        } catch (error) { optionalFailure(error); return () => {}; }
                    }, "dsh-groupchat: target activity");
                } catch (error) { optionalFailure(error); }
            };
            if (typeof ctx.inject === "function") {
                try { ctx.inject(["uiConversation"], (owner) => registerTarget(owner ?? ctx)); }
                catch (error) { optionalFailure(error); }
            } else registerTarget(ctx);

			// 主视图（conversation.view 列表槽 → 聊天区新 tab）
            recordDiagnostic("view-slot-register-start");
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "group-chat",
				order: -100,
				label: () => ctx.locale.bind(NS)("view.title"),
				locale: NS,
				inject: viewInject,
			}, (props) => h(GcErrorBoundary, null, h(GroupChatView, props))));

            try {
                ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "dsh-groupchat", order: 85, label: () => "多 AI 群聊", locale: NS }, () => h(GlobalSettings)));
            } catch (error) { recordDiagnostic("settings-registration-failed", safeError(error)); }
            recordDiagnostic("apply-complete");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
