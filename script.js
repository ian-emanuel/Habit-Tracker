/* =========================================================
   HABIT TRACKER PRO - JAVASCRIPT COMPLETO
   - Temporizador por actividad
   - Hora máxima
   - Notas / justificaciones
   - Monedas + tienda
   - Vidas + castigo por muerte
   - Protectores y pases
   - Gráficas 
   - Retos mensuales / anuales
   - Tiempo en pantalla
   - Frases según desempeño
   - Login local
   - PWA / Service Worker
   ========================================================= */

const STORAGE_KEY = "habitTracker";
const DAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const defaultApp = {
    version: 3,
    habitos: [],
    historial: [],
    racha: {
        actual: 0,
        mejor: 0,
        ultimaFecha: null
    },
    config: {
        nombre: "",
        rachaMinima: 80,
        vidasMaximas: 3,
        castigo: "400 lagartijas"
    },
    economia: {
        monedas: 0,
        vidas: 3,
        protectores: 0,
        pases: 0,
        pasesDia: 0
    },
    retos: {
        mensuales: {},
        anuales: {}
    },
    pantalla: {},
    usuario: {
        creado: false,
        nombre: "",
        correo: ""
    }
};

let app = clone(defaultApp);
let fechaPrueba = null;
let fechaCalendario = new Date();
let graficaGeneral = null;
let graficaHabito = null;
let timerInterval = null;

let timerState = {
    habitId: null,
    startedAt: null,
    elapsed: 0
};

let indiceEditando = null;
let ultimoEliminado = null;
let undoTimer = null;


/* =========================================================
   UTILIDADES
   ========================================================= */

const $ = id => document.getElementById(id);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function hoyISO() {
    if (fechaPrueba) {
        return fechaPrueba;
    }

    const d = new Date();

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateObj(iso) {
    return new Date(`${iso}T12:00:00`);
}

function isoFromDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(
    iso,
    options = {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }
) {
    return dateObj(iso).toLocaleDateString("es-MX", options);
}

function escapeHtml(value = "") {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
}

function toast(message, type = "info", duration = 3200) {
    const container = $("toast-container");

    if (!container) {
        return;
    }

    const toastEl = document.createElement("div");

    toastEl.className = `toast ${type}`;

    const icons = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️"
    };

    toastEl.innerHTML = `
        <span>${icons[type] || "ℹ️"}</span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toastEl);

    setTimeout(() => {
        toastEl.remove();
    }, duration);
}

function confirmar(message) {
    return new Promise(resolve => {
        const modal = $("modalConfirm");

        if (!modal) {
            resolve(window.confirm(message));
            return;
        }

        $("modalConfirmTexto").textContent = message;

        modal.classList.remove("oculto");

        const finish = value => {
            modal.classList.add("oculto");

            if ($("modalAceptar")) {
                $("modalAceptar").onclick = null;
            }

            if ($("modalCancelar")) {
                $("modalCancelar").onclick = null;
            }

            resolve(value);
        };

        $("modalAceptar").onclick = () => finish(true);
        $("modalCancelar").onclick = () => finish(false);
    });
}


/* =========================================================
   GUARDADO
   ========================================================= */

function save() {
    app.version = 3;

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(app)
    );
}


/* =========================================================
   NORMALIZACIÓN DE DATOS
   ========================================================= */

function ensureData() {
    app = Object.assign(
        clone(defaultApp),
        app || {}
    );

    app.config = Object.assign(
        clone(defaultApp.config),
        app.config || {}
    );

    app.economia = Object.assign(
        clone(defaultApp.economia),
        app.economia || {}
    );

    app.racha = Object.assign(
        clone(defaultApp.racha),
        app.racha || {}
    );

    app.usuario = Object.assign(
        clone(defaultApp.usuario),
        app.usuario || {}
    );

    app.retos = Object.assign(
        clone(defaultApp.retos),
        app.retos || {}
    );

    app.habitos = Array.isArray(app.habitos)
        ? app.habitos
        : [];

    app.historial = Array.isArray(app.historial)
        ? app.historial
        : [];

    app.pantalla =
        app.pantalla &&
        typeof app.pantalla === "object"
            ? app.pantalla
            : {};

    app.economia.monedas = Math.max(
        0,
        Number(app.economia.monedas) || 0
    );

    app.economia.vidas = Math.max(
        0,
        Math.min(
            Number(app.config.vidasMaximas) || 3,
            Number(app.economia.vidas) || 0
        )
    );

    app.economia.protectores = Math.max(
        0,
        Number(app.economia.protectores) || 0
    );

    app.economia.pases = Math.max(
        0,
        Number(app.economia.pases) || 0
    );

    app.economia.pasesDia = Math.max(
        0,
        Number(app.economia.pasesDia) || 0
    );

    app.habitos = app.habitos.map(h => ({
        id: h.id || uid("habit"),

        nombre:
            h.nombre ||
            "Actividad",

        dias:
            Array.isArray(h.dias) &&
            h.dias.length
                ? h.dias
                : ["todos"],

        duracion: Math.max(
            0,
            Number(
                h.duracion ||
                h.tiempoObjetivo ||
                0
            )
        ),

        horaMax:
            h.horaMax ||
            "",

        tipo:
            h.tipo ||
            (
                Number(h.duracion || 0) > 0
                    ? "timer"
                    : "check"
            )
    }));

    app.historial = app.historial.map(record => {
        const habits = {};

        Object.entries(
            record.habitos || {}
        ).forEach(([key, value]) => {

            const habit = app.habitos.find(
                h =>
                    h.id === key ||
                    h.nombre === key
            );

            const id = habit
                ? habit.id
                : key;

            if (typeof value === "boolean") {

                habits[id] = {
                    estado: value
                        ? "hecho"
                        : "pendiente",
                    nota: "",
                    tiempo: 0
                };

            } else {

                habits[id] = Object.assign(
                    {
                        estado: "pendiente",
                        nota: "",
                        tiempo: 0
                    },
                    value || {}
                );
            }
        });

        return Object.assign(
            {},
            record,
            {
                habitos: habits,
                nota: record.nota || ""
            }
        );
    });
}


/* =========================================================
   MIGRACIÓN / INICIO
   ========================================================= */

function migrate() {
    const raw = localStorage.getItem(
        STORAGE_KEY
    );

    if (raw) {
        try {
            app = JSON.parse(raw);
        } catch {
            app = clone(defaultApp);
        }
    }

    ensureData();

    if (!app.habitos.length) {

        app.habitos = [

            {
                id: uid("habit"),
                nombre: "💧 Beber agua",
                dias: ["todos"],
                duracion: 0,
                horaMax: "",
                tipo: "check"
            },

            {
                id: uid("habit"),
                nombre: "🏋️ Hacer ejercicio",
                dias: ["lunes"],
                duracion: 30,
                horaMax: "22:00",
                tipo: "timer"
            },

            {
                id: uid("habit"),
                nombre: "📚 Leer",
                dias: ["martes"],
                duracion: 20,
                horaMax: "23:00",
                tipo: "timer"
            },

            {
                id: uid("habit"),
                nombre: "😴 Dormir 8 horas",
                dias: ["todos"],
                duracion: 0,
                horaMax: "23:59",
                tipo: "check"
            }

        ];
    }

    save();
}


/* =========================================================
   ACTIVIDADES / REGISTROS
   ========================================================= */

function getHabitsForDate(iso) {
    const day =
        DAY_NAMES[
            dateObj(iso).getDay()
        ];

    return app.habitos.filter(
        h =>
            h.dias.includes("todos") ||
            h.dias.includes(day)
    );
}

function getTodayHabits() {
    return getHabitsForDate(
        hoyISO()
    );
}

function getRecord(iso = hoyISO()) {
    return app.historial.find(
        r => r.fecha === iso
    );
}

function getOrCreateRecord(iso) {

    let record = getRecord(iso);

    if (!record) {

        record = {
            fecha: iso,
            habitos: {},
            nota: "",
            porcentaje: 0,
            completados: 0,
            justificados: 0,
            total: 0
        };

        getHabitsForDate(iso).forEach(
            habit => {

                record.habitos[habit.id] = {
                    estado: "pendiente",
                    nota: "",
                    tiempo: 0
                };

            }
        );

        app.historial.push(record);
    }

    return record;
}

function getStatus(
    iso,
    habitId
) {

    const record = getRecord(iso);

    if (
        record &&
        record.habitos &&
        record.habitos[habitId]
    ) {
        return record.habitos[habitId];
    }

    return {
        estado: "pendiente",
        nota: "",
        tiempo: 0
    };
}

function setStatus(
    iso,
    habitId,
    patch
) {

    const record =
        getOrCreateRecord(iso);

    record.habitos[habitId] =
        Object.assign(
            {
                estado: "pendiente",
                nota: "",
                tiempo: 0
            },
            record.habitos[habitId] || {},
            patch
        );

    recalculateRecord(record);

    save();
}

function recalculateRecord(record) {

    const habits =
        getHabitsForDate(
            record.fecha
        );

    let completed = 0;
    let justified = 0;

    habits.forEach(h => {

        const state =
            record.habitos?.[h.id]?.estado;

        if (state === "hecho") {
            completed++;
        }

        if (
            state === "justificado" ||
            state === "pase"
        ) {
            justified++;
        }

    });

    record.total = habits.length;

    record.completados = completed;

    record.justificados = justified;

    record.porcentaje =
        Math.round(
            (
                completed /
                (habits.length || 1)
            ) * 100
        );
}

function effectivePercentage(record) {

    if (!record) {
        return 0;
    }

    const habits =
        getHabitsForDate(
            record.fecha
        );

    const effective =
        habits.filter(
            h =>
                [
                    "hecho",
                    "justificado",
                    "pase"
                ].includes(
                    record.habitos?.[h.id]?.estado
                )
        ).length;

    return Math.round(
        (
            effective /
            (habits.length || 1)
        ) * 100
    );
}


/* =========================================================
   HORA MÁXIMA
   ========================================================= */

function passedMaxTime(habit) {

    if (!habit.horaMax) {
        return false;
    }

    const [
        hour,
        minute
    ] =
        habit.horaMax
            .split(":")
            .map(Number);

    const now = new Date();

    const currentMinutes =
        now.getHours() * 60 +
        now.getMinutes();

    const maxMinutes =
        hour * 60 +
        minute;

    return currentMinutes >
        maxMinutes;
}


/* =========================================================
   COMPLETAR ACTIVIDAD
   ========================================================= */

function completeHabit(id) {

    const habit = app.habitos.find(h => h.id === id);
    if (!habit) return;

    if (passedMaxTime(habit)) {
        toast(`Ya pasó la hora máxima de ${habit.nombre}.`, "warning");
        renderHabits();
        return;
    }

    setStatus(hoyISO(), id, {
        estado: "hecho",
        nota: ""
    });

    // Guardar y dar monedas al momento
    const ganadas = rewardDay(hoyISO());
    save();
    actualizarTodo();

    let msg = `${habit.nombre} completado`;
    if (ganadas > 0) {
        msg += ` · +${ganadas} $`;
    }

    toast(msg, "success");
}


/* =========================================================
   JUSTIFICACIONES
   ========================================================= */

function openJustification(id) {

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    if (!habit) {
        return;
    }

    if ($("justificacionTitulo")) {
        $("justificacionTitulo").textContent =
            `Justificar: ${habit.nombre}`;
    }

    if ($("justificacionTexto")) {
        $("justificacionTexto").value =
            getStatus(
                hoyISO(),
                id
            ).nota || "";
    }

    if ($("modalJustificacion")) {

        $("modalJustificacion").dataset.habitId =
            id;

        $("modalJustificacion")
            .classList
            .remove("oculto");
    }
}

function saveJustification() {

    const modal =
        $("modalJustificacion");

    if (!modal) {
        return;
    }

    const id =
        modal.dataset.habitId;

    const text =
        $("justificacionTexto")
            ?.value
            .trim() || "";

    if (!text) {

        toast(
            "Escribe una justificación",
            "warning"
        );

        return;
    }

    setStatus(
        hoyISO(),
        id,
        {
            estado: "justificado",
            nota: text
        }
    );

    modal.classList.add("oculto");

    actualizarTodo();

    toast(
        "Justificación guardada. Protege tu racha, pero no aumenta el porcentaje.",
        "success"
    );
}


/* =========================================================
   RENDER DE ACTIVIDADES
   ========================================================= */

function renderHabits() {

    const box =
        $("listaHabitos");

    if (!box) {
        return;
    }

    box.innerHTML = "";

    const habits =
        getTodayHabits();

    if (!habits.length) {

        box.innerHTML = `
            <div class="empty">
                No tienes actividades para hoy 🌱
            </div>
        `;

        return;
    }

    const record =
        getRecord();

    habits.forEach(habit => {

        const status =
            record?.habitos?.[habit.id] ||
            {
                estado: "pendiente",
                nota: "",
                tiempo: 0
            };

        const locked =
            passedMaxTime(habit) &&
            ![
                "hecho",
                "justificado",
                "pase"
            ].includes(
                status.estado
            );

        const card =
            document.createElement("div");

        card.className =
            `habito-item ${
                status.estado === "justificado"
                    ? "justified"
                    : ""
            }`;

        const meta = [];

        if (habit.duracion > 0) {
            meta.push(
                `⏱️ ${habit.duracion} min`
            );
        }

        if (habit.horaMax) {
            meta.push(
                `⏰ ${habit.horaMax}`
            );
        }

        if (status.tiempo > 0) {
            meta.push(
                `▶ ${formatMinutes(
                    Math.round(
                        status.tiempo / 60
                    )
                )}`
            );
        }

        if (
            status.estado ===
            "justificado"
        ) {
            meta.push(
                "📝 Justificado"
            );
        }

        if (
            status.estado === "pase"
        ) {
            meta.push(
                "🎫 Pase usado"
            );
        }

        if (locked) {
            meta.push(
                "⛔ Bloqueada"
            );
        }

        card.innerHTML = `

            <div style="width:100%">

                <div class="habito-main">

                    <input
                        class="habito-checkbox"
                        type="checkbox"
                        ${
                            status.estado === "hecho"
                                ? "checked"
                                : ""
                        }
                        ${
                            locked
                                ? "disabled"
                                : ""
                        }
                    >

                    <div>

                        <div class="habito-nombre">
                            ${escapeHtml(
                                habit.nombre
                            )}
                        </div>

                        <div class="habito-meta">

                            ${
                                meta
                                    .map(
                                        x =>
                                            `<span class="badge">
                                                ${escapeHtml(x)}
                                            </span>`
                                    )
                                    .join("")
                            }

                        </div>

                    </div>

                </div>

                <div class="habito-actions">

                    ${
                        habit.duracion > 0 &&
                        status.estado === "pendiente" &&
                        !locked
                            ? `
                                <button class="timer-button">
                                    ⏱️ Temporizador
                                </button>
                            `
                            : ""
                    }

                    ${
                        status.estado !== "hecho" &&
                        status.estado !== "pase" &&
                        !locked
                            ? `
                                <button class="note-button">
                                    📝 Justificar
                                </button>
                            `
                            : ""
                    }

                    ${
                        status.estado === "pendiente" &&
                        app.economia.pases > 0 &&
                        !locked
                            ? `
                                <button class="pass-button">
                                    🎫 Usar pase
                                </button>
                            `
                            : ""
                    }

                </div>

                ${
                    habit.duracion > 0 &&
                    status.estado === "pendiente" &&
                    !locked
                        ? `
                            <div class="timer-box oculto"></div>
                        `
                        : ""
                }

                ${
                    status.estado === "justificado"
                        ? `
                            <div class="justification">
                                📝 ${escapeHtml(
                                    status.nota ||
                                    "Justificado"
                                )}
                            </div>
                        `
                        : ""
                }

                ${
                    locked
                        ? `
                            <div class="justification">
                                ⛔ Hora máxima superada
                                (${escapeHtml(
                                    habit.horaMax
                                )}).
                                Ya no se puede completar.
                            </div>
                        `
                        : ""
                }

            </div>
        `;

        const checkbox =
            card.querySelector(
                ".habito-checkbox"
            );

        if (checkbox) {

            checkbox.addEventListener(
                "change",
                () => {

                    if (checkbox.checked) {
                        completeHabit(
                            habit.id
                        );
                    }

                }
            );
        }

        card
            .querySelector(".note-button")
            ?.addEventListener(
                "click",
                () =>
                    openJustification(
                        habit.id
                    )
            );

        card
            .querySelector(".pass-button")
            ?.addEventListener(
                "click",
                () =>
                    useActivityPass(
                        habit.id
                    )
            );

        card
            .querySelector(".timer-button")
            ?.addEventListener(
                "click",
                () =>
                    openTimer(
                        habit.id,
                        card.querySelector(
                            ".timer-box"
                        )
                    )
            );

        box.appendChild(card);
    });

    checkPendingJustifications();
}


/* =========================================================
   TEMPORIZADOR
   ========================================================= */

function renderTimer(
    panel,
    habit
) {

    if (!panel || !habit) {
        return;
    }

    const total =
        habit.duracion * 60;

    const elapsed =
        Math.min(
            timerState.elapsed,
            total
        );

    const percent =
        total
            ? Math.round(
                (elapsed / total) *
                100
            )
            : 0;

    const minutes =
        pad(
            Math.floor(
                elapsed / 60
            )
        );

    const seconds =
        pad(
            elapsed % 60
        );

    panel.innerHTML = `

        <div class="timer-display">
            ${minutes}:${seconds}
        </div>

        <div class="timer-progress">

            <div
                class="timer-progress-bar"
                style="width:${percent}%"
            ></div>

        </div>

        <button
            class="timer-button ${
                timerState.startedAt
                    ? "running"
                    : ""
            }"
        >
            ${
                timerState.startedAt
                    ? "⏸ Pausar"
                    : "▶ Continuar"
            }
        </button>

        <button
            class="timer-button timer-stop"
        >
            ⏹ Detener
        </button>
    `;

    panel
        .querySelector(
            ".timer-button"
        )
        ?.addEventListener(
            "click",
            () => {

                if (
                    timerState.startedAt
                ) {
                    pauseTimer(
                        habit.id,
                        false
                    );
                } else {
                    startTimer(
                        habit.id
                    );
                }

            }
        );

    panel
        .querySelector(
            ".timer-stop"
        )
        ?.addEventListener(
            "click",
            () =>
                pauseTimer(
                    habit.id,
                    true
                )
        );
}

function openTimer(
    id,
    panel
) {

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    if (
        !habit ||
        !habit.duracion
    ) {
        return;
    }

    if (passedMaxTime(habit)) {

        toast(
            "La hora máxima ya pasó",
            "warning"
        );

        return;
    }

    if (
        timerState.habitId &&
        timerState.habitId !== id
    ) {

        toast(
            "Termina el temporizador actual primero",
            "warning"
        );

        return;
    }

    timerState.habitId = id;

    timerState.elapsed =
        getStatus(
            hoyISO(),
            id
        ).tiempo || 0;

    if (panel) {
        panel.classList.remove(
            "oculto"
        );

        renderTimer(
            panel,
            habit
        );
    }

    clearInterval(
        timerInterval
    );

    timerInterval =
        setInterval(() => {

            if (
                !timerState.startedAt
            ) {
                return;
            }

            const saved =
                getStatus(
                    hoyISO(),
                    id
                ).tiempo || 0;

            timerState.elapsed =
                Math.floor(
                    (
                        Date.now() -
                        timerState.startedAt
                    ) / 1000
                ) + saved;

            if (
                timerState.elapsed >=
                habit.duracion * 60
            ) {

                finishTimer(id);

            } else {

                renderHabitsWithOpenTimer(
                    id
                );
            }

        }, 1000);
}

function startTimer(id) {

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    if (
        !habit ||
        passedMaxTime(habit)
    ) {
        return;
    }

    timerState.habitId = id;

    timerState.startedAt =
        Date.now();

    toast(
        "Temporizador iniciado ⏱️",
        "info"
    );

    renderHabitsWithOpenTimer(id);
}

function pauseTimer(
    id,
    stop = false
) {

    if (
        timerState.habitId !== id
    ) {
        return;
    }

    if (
        timerState.startedAt
    ) {

        timerState.elapsed =
            Math.floor(
                (
                    Date.now() -
                    timerState.startedAt
                ) / 1000
            ) +
            (
                getStatus(
                    hoyISO(),
                    id
                ).tiempo || 0
            );
    }

    timerState.startedAt =
        null;

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    setStatus(
        hoyISO(),
        id,
        {
            tiempo: Math.min(
                timerState.elapsed,
                (
                    habit?.duracion ||
                    0
                ) * 60
            )
        }
    );

    if (stop) {

        clearInterval(
            timerInterval
        );

        timerInterval = null;

        timerState = {
            habitId: null,
            startedAt: null,
            elapsed: 0
        };
    }

    renderHabitsWithOpenTimer(
        stop
            ? null
            : id
    );
}

function finishTimer(id) {

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    if (!habit) {
        return;
    }

    clearInterval(
        timerInterval
    );

    timerInterval = null;

    if (passedMaxTime(habit)) {

        setStatus(
            hoyISO(),
            id,
            {
                tiempo:
                    habit.duracion *
                    60
            }
        );

        timerState = {
            habitId: null,
            startedAt: null,
            elapsed: 0
        };

        renderHabits();

        toast(
            "El temporizador terminó después de la hora máxima y no se completó.",
            "warning"
        );

        return;
    }

    setStatus(hoyISO(), id, {
    estado: "hecho",
        tiempo: habit.duracion * 60
    });

    const ganadas = rewardDay(hoyISO());
    save();

    timerState = {
        habitId: null,
        startedAt: null,
        elapsed: 0
    };

    renderHabits();
    actualizarDashboard();

    let msg = `${habit.nombre} completado por temporizador 🎉`;
    if (ganadas > 0) msg += ` · +${ganadas} $`;

    toast(msg, "success");
}

function renderHabitsWithOpenTimer(id) {

    renderHabits();

    if (!id) {
        return;
    }

    const cards =
        document.querySelectorAll(
            "#listaHabitos .habito-item"
        );

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    const index =
        getTodayHabits().findIndex(
            h => h.id === id
        );

    const card =
        cards[index];

    const panel =
        card?.querySelector(
            ".timer-box"
        );

    if (
        panel &&
        habit
    ) {

        panel.classList.remove(
            "oculto"
        );

        renderTimer(
            panel,
            habit
        );
    }
}


/* =========================================================
   PASE DE ACTIVIDAD
   ========================================================= */

function useActivityPass(id) {

    if (
        app.economia.pases <= 0
    ) {

        toast(
            "No tienes pases de actividad",
            "warning"
        );

        return;
    }

    app.economia.pases--;

    setStatus(
        hoyISO(),
        id,
        {
            estado: "pase",
            nota:
                "Se usó un pase de actividad"
        }
    );

    save();

    actualizarTodo();

    toast(
        "Pase usado. La actividad no rompe la racha.",
        "success"
    );
}


/* =========================================================
   GUARDAR DÍA
   ========================================================= */

function saveDay() {

    const record = getOrCreateRecord(hoyISO());

    if ($("notaDia")) {
        record.nota = $("notaDia").value.trim();
    }

    recalculateRecord(record);

    const ganadas = rewardDay(record.fecha);

    save();
    actualizarTodo();

    let mensaje = `Día guardado · ${record.porcentaje}%`;

    if (ganadas > 0) {
        mensaje += ` · +${ganadas} $`;
    }

    if (app.racha.actual > 0) {
        mensaje += ` · Racha ${app.racha.actual} 🔥`;
    }

    toast(mensaje, "success", 4000);

    if (record.porcentaje === 100 && record.total > 0) {
        confetti();
    }
}

function rewardDay(date) {

    const record = getRecord(date);
    if (!record) return;

    // Cuántas monedas “merece” el porcentaje actual
    let coinsQueTocan = 10;

    if (record.porcentaje >= 50) coinsQueTocan += 10;
    if (record.porcentaje >= 80) coinsQueTocan += 20;
    if (record.porcentaje === 100) coinsQueTocan += 20;

    // Cuántas ya se dieron este día
    const key = `reward_coins_${date}`;
    const yaDadas = Number(localStorage.getItem(key) || 0);

    // Solo damos la diferencia
    const diferencia = coinsQueTocan - yaDadas;

    if (diferencia <= 0) return 0;

    app.economia.monedas += diferencia;
    localStorage.setItem(key, String(coinsQueTocan));

    // Marca que ya se usó la app (para no quitar vida el primer día)
    localStorage.setItem("habitTracker_used", "1");

    actualizarRacha();
    actualizarRetos();

    return diferencia; // para poder mostrar cuántas se ganaron
}


/* =========================================================
   RACHA
   ========================================================= */

function actualizarRacha() {

    const minimum =
        Number(
            app.config.rachaMinima
        ) || 80;

    const records =
        [...app.historial]
            .sort(
                (a, b) =>
                    a.fecha.localeCompare(
                        b.fecha
                    )
            );

    let current = 0;
    let best = 0;
    let last = null;

    for (
        const record of records
    ) {

        const effective =
            effectivePercentage(
                record
            );

        if (
            effective >= minimum
        ) {

            if (last) {

                const diff =
                    Math.round(
                        (
                            dateObj(
                                record.fecha
                            ) -
                            dateObj(last)
                        ) / 86400000
                    );

                current =
                    diff === 1
                        ? current + 1
                        : 1;

            } else {

                current = 1;
            }

            last = record.fecha;

            best =
                Math.max(
                    best,
                    current
                );
        }
    }

    app.racha = {
        actual: current,
        mejor:
            Math.max(
                Number(
                    app.racha.mejor
                ) || 0,
                best
            ),
        ultimaFecha: last
    };

    save();
}


/* =========================================================
   CIERRE DEL DÍA / VIDAS
   ========================================================= */

function processYesterday() {

    const d = dateObj(hoyISO());
    d.setDate(d.getDate() - 1);
    const iso = isoFromDate(d);

    const closedKey = `closed_${iso}`;

    if (localStorage.getItem(closedKey)) {
        return;
    }

    const habits = getHabitsForDate(iso);

    if (!habits.length) {
        localStorage.setItem(closedKey, "1");
        return;
    }

    // ============================================
    // PROTECCIÓN PRIMER USO / RECIÉN INSTALADA
    // ============================================
    const haUsadoLaApp =
        app.historial.some(r =>
            r.completados > 0 ||
            r.porcentaje > 0 ||
            r.justificados > 0
        ) ||
        app.racha.mejor > 0 ||
        app.economia.monedas > 0 ||
        localStorage.getItem("habitTracker_used") === "1";

    if (!haUsadoLaApp) {
        // Es la primera vez → no penalizar
        localStorage.setItem(closedKey, "1");
        return;
    }

    // ============================================
    // Lógica normal de cierre de día
    // ============================================

    const record = getOrCreateRecord(iso);
    recalculateRecord(record);

    const effective = effectivePercentage(record);

    if (effective < Number(app.config.rachaMinima)) {

        if (record.protegido) {
            // Ya estaba protegido
        } else if (app.economia.protectores > 0) {

            app.economia.protectores--;
            record.protegido = true;
            toast("🛡️ Protector de racha usado automáticamente", "info");

        } else if (app.economia.pasesDia > 0) {

            app.economia.pasesDia--;
            record.protegido = true;
            record.habitos.__day = {
                estado: "pase",
                nota: "Pase de día usado"
            };

        } else {

            app.economia.vidas = Math.max(0, app.economia.vidas - 1);

            toast("❤️ Perdiste una vida por no cumplir ayer", "warning");

            if (app.economia.vidas === 0) {
                activateDeath();
            }
        }
    }

    localStorage.setItem(closedKey, "1");
    save();
    actualizarRacha();
}

function activateDeath() {

    if ($("modalMuerte")) {

        if ($("castigoTexto")) {
            $("castigoTexto").textContent =
                app.config.castigo ||
                "400 lagartijas";
        }

        $("modalMuerte")
            .classList
            .remove("oculto");
    }
}

function completePunishment() {

    app.economia.vidas =
        Number(
            app.config.vidasMaximas
        ) || 3;

    save();

    $("modalMuerte")
        ?.classList
        .add("oculto");

    toast(
        "Castigo registrado. Tus vidas fueron restauradas.",
        "success"
    );

    actualizarTodo();
}


/* =========================================================
   TIENDA
   ========================================================= */

const STORE_ITEMS = [

    {
        id: "life",
        name: "Vida",
        description:
            "Recupera una vida",
        price: 250,
        icon: "❤️"
    },

    {
        id: "shield",
        name: "Protector de racha",
        description:
            "Evita perder una racha por un día fallido",
        price: 150,
        icon: "🛡️"
    },

    {
        id: "pass",
        name: "Pase de actividad",
        description:
            "Pasa una actividad sin romper la racha",
        price: 100,
        icon: "🎫"
    },

    {
        id: "daypass",
        name: "Pase de día",
        description:
            "Protege un día completo",
        price: 500,
        icon: "📅"
    }

];

function buyItem(id) {

    const item =
        STORE_ITEMS.find(
            x => x.id === id
        );

    if (!item) {
        return;
    }

    if (
        app.economia.monedas <
        item.price
    ) {

        toast(
            "No tienes suficientes monedas",
            "warning"
        );

        return;
    }

    if (
        id === "life" &&
        app.economia.vidas >=
            app.config.vidasMaximas
    ) {

        toast(
            "Ya tienes todas tus vidas",
            "info"
        );

        return;
    }

    app.economia.monedas -=
        item.price;

    if (id === "life") {
        app.economia.vidas++;
    }

    if (id === "shield") {
        app.economia.protectores++;
    }

    if (id === "pass") {
        app.economia.pases++;
    }

    if (id === "daypass") {
        app.economia.pasesDia++;
    }

    save();

    renderStore();

    updateDashboard();

    toast(
        `${item.icon} ${item.name} comprado`,
        "success"
    );
}

function renderStore() {

    const box =
        $("tiendaItems");

    if (!box) {
        return;
    }

    box.innerHTML = "";

    STORE_ITEMS.forEach(item => {

        const el =
            document.createElement(
                "div"
            );

        el.className =
            "store-item";

        el.innerHTML = `

            <div>

                <strong>
                    ${item.icon}
                    ${escapeHtml(
                        item.name
                    )}
                </strong>

                <small>
                    ${escapeHtml(
                        item.description
                    )}
                </small>

            </div>

            <button class="mini-btn">
                ${item.price} $
            </button>
        `;

        el.querySelector(
            "button"
        ).addEventListener(
            "click",
            () =>
                buyItem(item.id)
        );

        box.appendChild(el);
    });

    if ($("monedas")) {
        $("monedas").textContent =
            app.economia.monedas;
    }

    if ($("vidas")) {
        $("vidas").textContent =
            app.economia.vidas;
    }

    if ($("protectores")) {
        $("protectores").textContent =
            app.economia.protectores;
    }

    if ($("pases")) {
        $("pases").textContent =
            app.economia.pases;
    }
}


/* =========================================================
   DASHBOARD
   ========================================================= */

function updateDashboard() {

    const record =
        getRecord();

    const habits =
        getTodayHabits();

    if ($("porcentajeHoy")) {
        $("porcentajeHoy").textContent =
            `${record?.porcentaje || 0}%`;
    }

    if ($("contadorHabitos")) {
        $("contadorHabitos").textContent =
            `${record?.completados || 0} / ${habits.length}`;
    }

    if ($("racha")) {
        $("racha").textContent =
            `🔥 ${app.racha.actual || 0}`;
    }

    if ($("mejorRacha")) {
        $("mejorRacha").textContent =
            app.racha.mejor || 0;
    }

    if ($("monedasTop")) {
        $("monedasTop").textContent =
            `${app.economia.monedas} $`;
    }

    if ($("vidasTop")) {

        $("vidasTop").textContent =
            `${
                "❤️".repeat(
                    app.economia.vidas
                )
            }${
                "🖤".repeat(
                    Math.max(
                        0,
                        app.config.vidasMaximas -
                        app.economia.vidas
                    )
                )
            }`;
    }

    if ($("screenTotalCard")) {

        $("screenTotalCard").textContent =
            formatMinutes(
                totalScreenMinutes(
                    hoyISO()
                )
            );
    }

    if ($("fraseDesempeno")) {

        $("fraseDesempeno").textContent =
            performancePhrase(
                record?.porcentaje || 0
            );
    }
}

function actualizarDashboard() {
    updateDashboard();
}


/* =========================================================
   FRASES
   ========================================================= */

function performancePhrase(percent) {

    const bad = [

        "Hoy fue un día flojo. Mañana tienes otra oportunidad.",

        "Un mal día no borra tu progreso. Vuelve a intentarlo.",

        "No necesitas perfección; necesitas volver a empezar."

    ];

    const medium = [

        "Vas por buen camino. Mantén el ritmo.",

        "Más de la mitad está hecho. Sigue avanzando.",

        "La constancia se construye con días como este."

    ];

    const good = [

        "Excelente trabajo. Estás construyendo una gran racha. 🔥",

        "Muy buen día. No sueltes el ritmo. 💪",

        "Gran desempeño. Sigue así. 🏆"

    ];

    const list =
        percent < 50
            ? bad
            : percent < 80
                ? medium
                : good;

    return list[
        new Date().getDate() %
        list.length
    ];
}


/* =========================================================
   CALENDARIO
   ========================================================= */

function createCalendar() {

    const box = $("calendar");

    if (!box) {
        return;
    }

    box.innerHTML = "";
    box.className = "calendar-grid";

    const year =
        fechaCalendario.getFullYear();

    const month =
        fechaCalendario.getMonth();

    if ($("mesActual")) {

        $("mesActual").textContent =
            `${MONTH_NAMES[month]} ${year}`;

    }

    const nombresDias = [
        "Lun",
        "Mar",
        "Mié",
        "Jue",
        "Vie",
        "Sáb",
        "Dom"
    ];

    nombresDias.forEach(nombre => {

        const el =
            document.createElement("div");

        el.className =
            "calendar-day-name";

        el.textContent =
            nombre;

        box.appendChild(el);

    });

    let firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();

    firstDay =
        firstDay === 0
            ? 6
            : firstDay - 1;

    for (
        let i = 0;
        i < firstDay;
        i++
    ) {

        const empty =
            document.createElement("div");

        empty.className =
            "calendar-day empty";

        box.appendChild(empty);

    }

    const days =
        new Date(
            year,
            month + 1,
            0
        ).getDate();

    const today =
        hoyISO();

    for (
        let day = 1;
        day <= days;
        day++
    ) {

        const iso =
            `${year}-${pad(month + 1)}-${pad(day)}`;

        const record =
            getRecord(iso);

        const el =
            document.createElement("div");

        el.className =
            "calendar-day";

        /* ======================================
           PORCENTAJE
        ====================================== */

        const percent =
            record?.porcentaje;

        if (percent != null) {

            if (percent >= 80) {

                el.classList.add(
                    "day-good"
                );

            } else if (percent >= 50) {

                el.classList.add(
                    "day-medium"
                );

            } else {

                el.classList.add(
                    "day-bad"
                );

            }

        } else {

            el.classList.add(
                "day-empty"
            );

        }

        /* ======================================
           HOY
        ====================================== */

        if (iso === today) {

            el.classList.add(
                "today"
            );

        }

        /* ======================================
           INFORMACIÓN EXTRA
        ====================================== */

        let justified = 0;

        let completed = 0;

        let total = 0;

        if (record) {

            const habits =
                getHabitsForDate(iso);

            total =
                habits.length;

            habits.forEach(habit => {

                const status =
                    record.habitos?.[
                        habit.id
                    ];

                if (
                    status?.estado ===
                    "hecho"
                ) {

                    completed++;

                }

                if (
                    status?.estado ===
                    "justificado"
                ) {

                    justified++;

                }

            });

        }

        el.innerHTML = `

            <div class="calendar-number">
                ${day}
            </div>

            <div class="calendar-percent">
                ${
                    percent == null
                        ? "—"
                        : `${percent}%`
                }
            </div>

            ${
                record
                    ? `
                        <div class="calendar-mini">
                            
                            ${
                                justified
                                    ? `  📝${justified}`
                                    : ""
                            }
                        </div>
                    `
                    : ""
            }

        `;

        el.title =
            record
                ? `${formatDate(iso)} · ${percent}%`
                : `${formatDate(iso)} · Sin registro`;

        /* ======================================
           ABRIR DETALLE
        ====================================== */

        el.addEventListener(
            "click",
            () => showDayDetail(iso)
        );

        box.appendChild(el);

    }
}

/* =========================================================
   DETALLE DEL DÍA
   ========================================================= */

function showDayDetail(iso) {

    const record = getRecord(iso);

    if (!record) {
        toast("No hay registro este día", "info");
        return;
    }

    if ($("detalleFecha")) {
        $("detalleFecha").textContent = `📅 ${formatDate(iso)}`;
    }

    if ($("detallePorcentaje")) {
        $("detallePorcentaje").textContent = `${record.porcentaje}%`;
    }

    const list = $("detalleHabitos");

    if (list) {
        list.innerHTML = "";

        getHabitsForDate(iso).forEach(habit => {

            const status = record.habitos?.[habit.id] || {
                estado: "pendiente"
            };

            const icon =
                status.estado === "hecho"       ? "✅" :
                status.estado === "justificado" ? "📝" :
                status.estado === "pase"        ? "🎫" :
                                                  "❌";

            const hasNote = (status.estado === "justificado" || status.estado === "pase") && status.nota;

            const row = document.createElement("div");
            row.className = `detail-item ${status.estado}`;

            row.innerHTML = `
                <div class="detail-main" style="display:flex; align-items:center; gap:10px; width:100%; cursor:${hasNote ? "pointer" : "default"};">
                    <span>${icon}</span>
                    <span style="flex:1;">${escapeHtml(habit.nombre)}</span>
                    ${hasNote ? `<span class="detail-toggle" style="font-size:12px; opacity:0.6;">▼</span>` : ""}
                </div>
                ${hasNote ? `
                    <div class="detail-note oculto" style="margin-top:8px; width:100%;">
                        <div class="justification">
                            ${status.estado === "justificado" ? "📝" : "🎫"} ${escapeHtml(status.nota)}
                        </div>
                    </div>
                ` : ""}
            `;

            // Solo si tiene justificación, al hacer clic se despliega
            if (hasNote) {
                const main = row.querySelector(".detail-main");
                const note = row.querySelector(".detail-note");
                const toggle = row.querySelector(".detail-toggle");

                main.addEventListener("click", () => {
                    const isHidden = note.classList.contains("oculto");

                    note.classList.toggle("oculto", !isHidden);
                    toggle.textContent = isHidden ? "▲" : "▼";
                });
            }

            list.appendChild(row);
        });
    }

    if ($("detalleNota")) {
        $("detalleNota").textContent = record.nota
            ? `📝 ${record.nota}`
            : "";

        $("detalleNota").classList.toggle("oculto", !record.nota);
    }

    $("modalDetalle")?.classList.remove("oculto");
}

function closeDetail() {

    $("modalDetalle")
        ?.classList
        .add("oculto");
}


/* =========================================================
   GRÁFICAS
   ========================================================= */

function chartData(
    type = "semana"
) {

    const today =
        dateObj(
            hoyISO()
        );

    const labels = [];
    const values = [];

    if (type === "mes") {

        const year =
            today.getFullYear();

        const month =
            today.getMonth();

        const days =
            new Date(
                year,
                month + 1,
                0
            ).getDate();

        for (
            let day = 1;
            day <= days;
            day++
        ) {

            labels.push(day);

            values.push(
                getRecord(
                    `${year}-${pad(month + 1)}-${pad(day)}`
                )?.porcentaje || 0
            );
        }

        return {
            labels,
            values,
            title:
                `${MONTH_NAMES[month]} ${year}`
        };
    }

    if (type === "año") {

        const year =
            today.getFullYear();

        for (
            let month = 0;
            month < 12;
            month++
        ) {

            const days =
                new Date(
                    year,
                    month + 1,
                    0
                ).getDate();

            let sum = 0;

            for (
                let day = 1;
                day <= days;
                day++
            ) {

                sum +=
                    getRecord(
                        `${year}-${pad(month + 1)}-${pad(day)}`
                    )?.porcentaje || 0;
            }

            labels.push(
                MONTH_SHORT[month]
            );

            values.push(
                Math.round(
                    sum / days
                )
            );
        }

        return {
            labels,
            values,
            title:
                `Año ${year}`
        };
    }

    for (
        let i = 6;
        i >= 0;
        i--
    ) {

        const d =
            new Date(today);

        d.setDate(
            today.getDate() - i
        );

        const iso =
            isoFromDate(d);

        labels.push(
            `${
                [
                    "Dom",
                    "Lun",
                    "Mar",
                    "Mié",
                    "Jue",
                    "Vie",
                    "Sáb"
                ][d.getDay()]
            } ${d.getDate()}`
        );

        values.push(
            getRecord(iso)
                ?.porcentaje || 0
        );
    }

    return {
        labels,
        values,
        title:
            "Últimos 7 días"
    };
}

function getChartTextColor() {

    return document.body.classList.contains(
        "light"
    )
        ? "#1f2328"
        : "#f0f6fc";
}

function updateGeneralChart(
    type = "semana"
) {

    const canvas =
        $("graficaGeneral");

    if (
        !canvas ||
        typeof Chart ===
            "undefined"
    ) {
        return;
    }

    const data =
        chartData(type);

    graficaGeneral?.destroy();

    graficaGeneral =
        new Chart(
            canvas,
            {
                type: "line",

                data: {

                    labels:
                        data.labels,

                    datasets: [

                        {
                            label:
                                data.title,

                            data:
                                data.values,

                            tension:
                                0.35,

                            fill:
                                true,

                            borderWidth:
                                3,

                            backgroundColor:
                                "rgba(88,166,255,.15)",

                            borderColor:
                                "#58a6ff",

                            pointRadius:
                                4
                        }

                    ]
                },

                options: {

                    responsive:
                        true,

                    plugins: {

                        legend: {

                            labels: {
                                color:
                                    getChartTextColor()
                            }
                        }
                    },

                    scales: {

                        x: {

                            ticks: {
                                color:
                                    getChartTextColor()
                            }
                        },

                        y: {

                            beginAtZero:
                                true,

                            max:
                                100,

                            ticks: {

                                color:
                                    getChartTextColor(),

                                callback:
                                    value =>
                                        `${value}%`
                            }
                        }
                    }
                }
            }
        );
}


/* =========================================================
   GRÁFICA POR HÁBITO
   ========================================================= */

function populateHabitSelector() {

    const select =
        $("selectorHabito");

    if (!select) {
        return;
    }

    const old =
        select.value;

    select.innerHTML =
        `
            <option value="">
                Selecciona una actividad
            </option>
        `;

    app.habitos.forEach(
        habit => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                habit.id;

            option.textContent =
                habit.nombre;

            select.appendChild(
                option
            );
        }
    );

    if (
        app.habitos.some(
            h => h.id === old
        )
    ) {
        select.value = old;
    }
}

function analyzeHabit(id) {

    if (!id) {

        if ($("totalHabito")) {
            $("totalHabito").textContent =
                "0";
        }

        if ($("porcentajeHabito")) {
            $("porcentajeHabito").textContent =
                "0%";
        }

        if ($("rachaHabito")) {
            $("rachaHabito").textContent =
                "0";
        }

        graficaHabito?.destroy();

        graficaHabito =
            null;

        return;
    }

    const habit =
        app.habitos.find(
            h => h.id === id
        );

    if (!habit) {
        return;
    }

    const applicable =
        app.historial.filter(
            r =>
                getHabitsForDate(
                    r.fecha
                ).some(
                    h => h.id === id
                )
        );

    const completed =
        applicable.filter(
            r =>
                r.habitos?.[id]
                    ?.estado ===
                "hecho"
        ).length;

    const percent =
        applicable.length
            ? Math.round(
                completed /
                applicable.length *
                100
            )
            : 0;

    if ($("totalHabito")) {
        $("totalHabito").textContent =
            completed;
    }

    if ($("porcentajeHabito")) {
        $("porcentajeHabito").textContent =
            `${percent}%`;
    }

    if ($("rachaHabito")) {
        $("rachaHabito").textContent =
            calculateHabitStreak(id);
    }

    const canvas =
        $("graficaHabito");

    if (
        !canvas ||
        typeof Chart ===
            "undefined"
    ) {
        return;
    }

    graficaHabito?.destroy();

    graficaHabito =
        new Chart(
            canvas,
            {
                type: "bar",

                data: {

                    labels:
                        applicable.map(
                            r => r.fecha
                        ),

                    datasets: [

                        {
                            label:
                                habit.nombre,

                            data:
                                applicable.map(
                                    r =>
                                        r.habitos?.[id]
                                            ?.estado ===
                                        "hecho"
                                            ? 100
                                            : 0
                                ),

                            backgroundColor:
                                "#3fb950",

                            borderRadius:
                                6
                        }

                    ]
                },

                options: {

                    responsive:
                        true,

                    scales: {

                        y: {

                            min:
                                0,

                            max:
                                100,

                            ticks: {

                                callback:
                                    value =>
                                        `${value}%`
                            }
                        }
                    }
                }
            }
        );
}

function calculateHabitStreak(id) {

    const records =
        [...app.historial]
            .sort(
                (a, b) =>
                    a.fecha.localeCompare(
                        b.fecha
                    )
            );

    let current = 0;
    let best = 0;
    let previous = null;

    records.forEach(
        record => {

            if (
                !getHabitsForDate(
                    record.fecha
                ).some(
                    h => h.id === id
                )
            ) {
                return;
            }

            if (
                record.habitos?.[id]
                    ?.estado ===
                "hecho"
            ) {

                if (previous) {

                    const diff =
                        Math.round(
                            (
                                dateObj(
                                    record.fecha
                                ) -
                                dateObj(previous)
                            ) / 86400000
                        );

                    current =
                        diff === 1
                            ? current + 1
                            : 1;

                } else {

                    current = 1;
                }

                previous =
                    record.fecha;

                best =
                    Math.max(
                        best,
                        current
                    );

            } else {

                current = 0;

                previous =
                    record.fecha;
            }
        }
    );

    return best;
}


/* =========================================================
   DÍAS DE ACTIVIDADES
   ========================================================= */

function editDays(selector) {

    return [
        ...document.querySelectorAll(
            `${selector}.active`
        )
    ].map(
        b => b.dataset.dia
    );
}

function toggleDayButton(
    button,
    selector
) {

    const day =
        button.dataset.dia;

    if (day === "todos") {

        document
            .querySelectorAll(
                selector
            )
            .forEach(
                b =>
                    b.classList.remove(
                        "active"
                    )
            );

        button.classList.add(
            "active"
        );

        return;
    }

    document
        .querySelector(
            `${selector}[data-dia="todos"]`
        )
        ?.classList.remove(
            "active"
        );

    button.classList.toggle(
        "active"
    );
}

function initDayButtons() {

    document
        .querySelectorAll(
            ".dia-btn:not(.edit-dia)"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        toggleDayButton(
                            button,
                            ".dia-btn:not(.edit-dia)"
                        )
                );
            }
        );

    document
        .querySelectorAll(
            ".edit-dia"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        toggleDayButton(
                            button,
                            ".edit-dia"
                        )
                );
            }
        );
}


/* =========================================================
   AGREGAR ACTIVIDAD
   ========================================================= */

function addHabit() {

    const name =
        $("nuevoHabito")
            ?.value
            .trim() || "";

    const days =
        editDays(
            ".dia-btn:not(.edit-dia)"
        );

    const duration =
        Math.max(
            0,
            Number(
                $("nuevaDuracion")
                    ?.value || 0
            )
        );

    const maxTime =
        $("nuevaHoraMax")
            ?.value || "";

    if (
        !name ||
        !days.length
    ) {

        toast(
            "Escribe un nombre y selecciona al menos un día",
            "warning"
        );

        return;
    }

    app.habitos.push({

        id:
            uid("habit"),

        nombre:
            name,

        dias:
            days,

        duracion:
            duration,

        horaMax:
            maxTime,

        tipo:
            duration > 0
                ? "timer"
                : "check"

    });

    save();

    if ($("nuevoHabito")) {
        $("nuevoHabito").value =
            "";
    }

    if ($("nuevaDuracion")) {
        $("nuevaDuracion").value =
            "0";
    }

    if ($("nuevaHoraMax")) {
        $("nuevaHoraMax").value =
            "";
    }

    document
        .querySelectorAll(
            ".dia-btn:not(.edit-dia)"
        )
        .forEach(
            b =>
                b.classList.remove(
                    "active"
                )
        );

    actualizarTodo();

    toast(
        "Actividad añadida",
        "success"
    );
}


/* =========================================================
   EDITOR DE ACTIVIDADES
   ========================================================= */

function renderEditor() {

    const box =
        $("listaEditar");

    if (!box) {
        return;
    }

    box.innerHTML = "";

    app.habitos.forEach(
        (habit, index) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "editor-item";

            item.draggable =
                true;

            item.dataset.index =
                index;

            item.innerHTML = `

                <div class="editor-info">

                    <strong>
                        ${escapeHtml(
                            habit.nombre
                        )}
                    </strong>

                    <small>
                        ${
                            habit.dias.includes(
                                "todos"
                            )
                                ? "Todos"
                                : habit.dias.join(
                                    ", "
                                )
                        }

                        ·

                        ${
                            habit.duracion
                                ? `${habit.duracion} min`
                                : "sin temporizador"
                        }

                        ${
                            habit.horaMax
                                ? ` · límite ${habit.horaMax}`
                                : ""
                        }

                    </small>

                </div>

                <div class="editor-actions">

                    <button class="secondary edit-button">
                        Editar
                    </button>

                    <button class="danger delete-button">
                        Eliminar
                    </button>

                </div>
            `;

            item
                .querySelector(
                    ".edit-button"
                )
                .addEventListener(
                    "click",
                    () =>
                        openEdit(index)
                );

            item
                .querySelector(
                    ".delete-button"
                )
                .addEventListener(
                    "click",
                    () =>
                        deleteHabit(index)
                );

            item.addEventListener(
                "dragstart",
                e => {

                    e.dataTransfer.setData(
                        "text/plain",
                        String(index)
                    );

                    item.classList.add(
                        "dragging"
                    );
                }
            );

            item.addEventListener(
                "dragend",
                () =>
                    item.classList.remove(
                        "dragging"
                    )
            );

            item.addEventListener(
                "dragover",
                e =>
                    e.preventDefault()
            );

            item.addEventListener(
                "drop",
                e => {

                    e.preventDefault();

                    const from =
                        Number(
                            e.dataTransfer.getData(
                                "text/plain"
                            )
                        );

                    const to =
                        Number(
                            item.dataset.index
                        );

                    if (
                        from === to ||
                        Number.isNaN(from)
                    ) {
                        return;
                    }

                    const moved =
                        app.habitos.splice(
                            from,
                            1
                        )[0];

                    app.habitos.splice(
                        to,
                        0,
                        moved
                    );

                    save();

                    renderEditor();
                    renderHabits();
                    populateHabitSelector();

                    toast(
                        "Actividades reordenadas",
                        "success"
                    );
                }
            );

            box.appendChild(
                item
            );
        }
    );
}


/* =========================================================
   EDITAR ACTIVIDAD
   ========================================================= */

function openEdit(index) {

    const habit =
        app.habitos[index];

    if (!habit) {
        return;
    }

    indiceEditando =
        index;

    if ($("editarNombre")) {
        $("editarNombre").value =
            habit.nombre;
    }

    if ($("editarDuracion")) {
        $("editarDuracion").value =
            habit.duracion || 0;
    }

    if ($("editarHoraMax")) {
        $("editarHoraMax").value =
            habit.horaMax || "";
    }

    document
        .querySelectorAll(
            ".edit-dia"
        )
        .forEach(
            button =>
                button.classList.toggle(
                    "active",
                    habit.dias.includes(
                        button.dataset.dia
                    )
                )
        );

    $("modalEditar")
        ?.classList
        .remove("oculto");
}

function closeEdit() {

    $("modalEditar")
        ?.classList
        .add("oculto");

    indiceEditando =
        null;
}

function saveEdit() {

    if (
        indiceEditando === null
    ) {
        return;
    }

    const habit =
        app.habitos[
            indiceEditando
        ];

    const name =
        $("editarNombre")
            ?.value
            .trim() || "";

    const days =
        editDays(
            ".edit-dia"
        );

    const duration =
        Math.max(
            0,
            Number(
                $("editarDuracion")
                    ?.value || 0
            )
        );

    const maxTime =
        $("editarHoraMax")
            ?.value || "";

    if (
        !name ||
        !days.length
    ) {

        toast(
            "Nombre y al menos un día son obligatorios",
            "warning"
        );

        return;
    }

    habit.nombre =
        name;

    habit.dias =
        days;

    habit.duracion =
        duration;

    habit.horaMax =
        maxTime;

    habit.tipo =
        duration > 0
            ? "timer"
            : "check";

    save();

    closeEdit();

    actualizarTodo();

    toast(
        "Actividad actualizada",
        "success"
    );
}


/* =========================================================
   ELIMINAR / DESHACER
   ========================================================= */

function deleteHabit(index) {

    confirmar(
        "¿Quieres eliminar esta actividad?"
    ).then(ok => {

        if (!ok) {
            return;
        }

        ultimoEliminado = {

            habit:
                clone(
                    app.habitos[index]
                ),

            index
        };

        app.habitos.splice(
            index,
            1
        );

        save();

        actualizarTodo();

        showUndoToast();
    });
}

function showUndoToast() {

    const container =
        $("toast-container");

    if (
        !container ||
        !ultimoEliminado
    ) {
        return;
    }

    const item =
        document.createElement(
            "div"
        );

    item.className =
        "toast warning";

    item.textContent =
        "↩️ Actividad eliminada. Haz clic para deshacer";

    item.addEventListener(
        "click",
        () => {

            if (!ultimoEliminado) {
                return;
            }

            app.habitos.splice(
                ultimoEliminado.index,
                0,
                ultimoEliminado.habit
            );

            ultimoEliminado =
                null;

            clearTimeout(
                undoTimer
            );

            item.remove();

            save();

            actualizarTodo();

            toast(
                "Actividad restaurada",
                "success"
            );
        }
    );

    container.appendChild(
        item
    );

    clearTimeout(
        undoTimer
    );

    undoTimer =
        setTimeout(
            () => {

                ultimoEliminado =
                    null;

                item.remove();

            },
            5000
        );
}


/* =========================================================
   RETOS
   ========================================================= */

function renderChallenges() {

    const now =
        dateObj(
            hoyISO()
        );

    const monthKey =
        `${now.getFullYear()}-${pad(
            now.getMonth() + 1
        )}`;

    const yearKey =
        String(
            now.getFullYear()
        );

    if (
        !app.retos.mensuales[
            monthKey
        ]
    ) {

        app.retos.mensuales[
            monthKey
        ] =
            generateMonthlyChallenge(
                monthKey
            );
    }

    if (
        !app.retos.anuales[
            yearKey
        ]
    ) {

        app.retos.anuales[
            yearKey
        ] =
            generateAnnualChallenge(
                yearKey
            );
    }

    renderChallengeList(
        "retosMensuales",
        app.retos.mensuales[
            monthKey
        ],
        "month"
    );

    renderChallengeList(
        "retosAnuales",
        app.retos.anuales[
            yearKey
        ],
        "year"
    );

    save();
}

function generateMonthlyChallenge(
    key
) {

    return {

        key,

        goals: [

            {
                id:
                    "days80",

                text:
                    "Completa 20 días al 80%",

                target:
                    20
            },

            {
                id:
                    "perfect",

                text:
                    "Consigue 5 días al 100%",

                target:
                    5
            },

            {
                id:
                    "streak",

                text:
                    "Alcanza una racha de 7 días",

                target:
                    7
            }

        ]
    };
}

function generateAnnualChallenge(
    key
) {

    return {

        key,

        goals: [

            {
                id:
                    "days80",

                text:
                    "Completa 200 días al 80%",

                target:
                    200
            },

            {
                id:
                    "perfect",

                text:
                    "Consigue 50 días al 100%",

                target:
                    50
            },

            {
                id:
                    "streak",

                text:
                    "Alcanza una racha de 30 días",

                target:
                    30
            }

        ]
    };
}

function challengeValue(
    goalId,
    scope
) {

    const today =
        dateObj(
            hoyISO()
        );

    const year =
        today.getFullYear();

    const monthPrefix =
        `${year}-${pad(
            today.getMonth() + 1
        )}`;

    const records =
        app.historial.filter(
            r =>
                scope === "month"
                    ? r.fecha.startsWith(
                        monthPrefix
                    )
                    : r.fecha.startsWith(
                        String(year)
                    )
        );

    if (
        goalId === "days80"
    ) {

        return records.filter(
            r =>
                r.porcentaje >= 80
        ).length;
    }

    if (
        goalId === "perfect"
    ) {

        return records.filter(
            r =>
                r.porcentaje === 100
        ).length;
    }

    if (
        goalId === "streak"
    ) {

        return app.racha.mejor;
    }

    return 0;
}

function renderChallengeList(
    id,
    challenge,
    scope
) {

    const box =
        $(id);

    if (!box) {
        return;
    }

    box.innerHTML = "";

    challenge.goals.forEach(
        goal => {

            const value =
                Math.min(
                    goal.target,
                    challengeValue(
                        goal.id,
                        scope
                    )
                );

            const percent =
                Math.round(
                    value /
                    goal.target *
                    100
                );

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "reto-item";

            item.innerHTML = `

                <div class="challenge-head">

                    <strong>
                        ${escapeHtml(
                            goal.text
                        )}
                    </strong>

                    <span>
                        ${value}/${goal.target}
                    </span>

                </div>

                <div class="reto-progress">

                    <div
                        class="reto-progress-bar"
                        style="width:${percent}%"
                    ></div>

                </div>
            `;

            box.appendChild(
                item
            );
        }
    );
}

function actualizarRetos() {
    renderChallenges();
}


/* =========================================================
   TIEMPO EN PANTALLA
   ========================================================= */

function saveScreenTime() {

    const date =
        hoyISO();

    const name =
        $("screenApp")
            ?.value
            .trim() || "";

    const minutes =
        Math.max(
            0,
            Number(
                $("screenMinutes")
                    ?.value || 0
            )
        );

    if (
        !name ||
        minutes <= 0
    ) {

        toast(
            "Indica aplicación y minutos",
            "warning"
        );

        return;
    }

    if (
        !app.pantalla[date]
    ) {

        app.pantalla[date] =
            {};
    }

    app.pantalla[date][name] =
        (
            app.pantalla[date][name] ||
            0
        ) + minutes;

    save();

    if ($("screenApp")) {
        $("screenApp").value =
            "";
    }

    if ($("screenMinutes")) {
        $("screenMinutes").value =
            "";
    }

    renderScreenTime();

    updateDashboard();

    toast(
        `Tiempo de ${name} registrado`,
        "success"
    );
}

function totalScreenMinutes(
    date
) {

    return Object.values(
        app.pantalla[date] || {}
    ).reduce(
        (
            sum,
            value
        ) =>
            sum +
            Number(
                value || 0
            ),
        0
    );
}

function formatMinutes(
    minutes
) {

    minutes =
        Math.max(
            0,
            Math.round(
                Number(
                    minutes
                ) || 0
            )
        );

    return minutes >= 60
        ? `${Math.floor(
            minutes / 60
        )}h ${
            minutes % 60
        }m`
        : `${minutes}m`;
}

function renderScreenTime() {

    const box =
        $("screenList");

    if (!box) {
        return;
    }

    const data =
        app.pantalla[
            hoyISO()
        ] || {};

    box.innerHTML = "";

    Object.entries(
        data
    ).forEach(
        ([name, minutes]) => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "screen-item";

            row.innerHTML = `

                <span>
                    📱 ${escapeHtml(name)}
                </span>

                <strong>
                    ${formatMinutes(
                        minutes
                    )}
                </strong>

            `;

            box.appendChild(
                row
            );
        }
    );

    if ($("screenTotal")) {

        $("screenTotal").textContent =
            formatMinutes(
                totalScreenMinutes(
                    hoyISO()
                )
            );
    }
}

function renderStatsExtras() {

    renderScreenTime();

    renderChallenges();
}


/* =========================================================
   NAVEGACIÓN
   ========================================================= */

function showSection(
    id,
    button
) {

    document
        .querySelectorAll(
            ".pagina"
        )
        .forEach(
            page =>
                page.classList.add(
                    "oculto"
                )
        );

    $(id)
        ?.classList
        .remove("oculto");

    document
        .querySelectorAll(
            ".menu"
        )
        .forEach(
            menu =>
                menu.classList.remove(
                    "active"
                )
        );

    button
        ?.classList
        .add("active");

    if (
        id === "estadisticas"
    ) {

        const active =
            document.querySelector(
                ".tabs button.active"
            );

        updateGeneralChart(
            active?.dataset.tipo ||
            "semana"
        );

        renderStatsExtras();
    }

    if (
        id === "tienda"
    ) {
        renderStore();
    }

    if (
        id === "retos"
    ) {
        renderChallenges();
    }

    if (
        id === "pantalla"
    ) {
        renderScreenTime();
    }

    if (
        id === "configuracion"
    ) {
        renderUser();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function mostrar(
    id,
    button
) {

    showSection(
        id,
        button
    );
}


/* =========================================================
   CALENDARIO
   ========================================================= */

function previousMonth() {

    fechaCalendario.setMonth(
        fechaCalendario.getMonth() - 1
    );

    createCalendar();
}

function nextMonth() {

    fechaCalendario.setMonth(
        fechaCalendario.getMonth() + 1
    );

    createCalendar();
}

function mesAnterior() {
    previousMonth();
}

function mesSiguiente() {
    nextMonth();
}


/* =========================================================
   MODO OSCURO / CLARO
   ========================================================= */

function changeMode() {

    const light =
        !document.body.classList.contains(
            "light"
        );

    document.body.classList.toggle(
        "light",
        light
    );

    localStorage.setItem(
        "modo",
        light
            ? "claro"
            : "oscuro"
    );

    const active =
        document.querySelector(
            ".tabs button.active"
        );

    updateGeneralChart(
        active?.dataset.tipo ||
        "semana"
    );
}

function cambiarModo() {
    changeMode();
}


/* =========================================================
   SALUDO
   ========================================================= */

function updateGreeting() {

    const name =
        app.usuario?.nombre ||
        "";

    const hour =
        new Date().getHours();

    const greeting =
        hour < 12
            ? "Buenos días"
            : hour < 19
                ? "Buenas tardes"
                : "Buenas noches";

    if ($("saludo")) {

        $("saludo").textContent =
            name
                ? `${greeting}, ${name} 👋`
                : `${greeting} 👋`;

    }
}


/* =========================================================
   LOGIN LOCAL
   ========================================================= */

function renderUser() {
    const logged = !!app.usuario.creado;

    if ($("userStatus")) {
        $("userStatus").innerHTML = logged
            ? `${escapeHtml(app.usuario.nombre)} · ${escapeHtml(app.usuario.correo)} <span class="account-cloud">☁️ Sincronizado</span>`
            : "Sin sesión";
    }

    const text = logged ? "Cerrar sesión" : "Iniciar sesión";

    if ($("btnLogin")) {
        $("btnLogin").textContent = text;
    }

    // Botón de Configuración
    if ($("btnLoginConfig")) {
        $("btnLoginConfig").textContent = text;
        $("btnLoginConfig").className = logged ? "danger" : "primary";
    }
}

function openLogin() {

    $("modalLogin")
        ?.classList
        .remove("oculto");
}

function loginLocal() {

    const name =
        $("loginNombre")
            ?.value
            .trim() || "";

    const email =
        $("loginEmail")
            ?.value
            .trim() || "";

    if (
        !name ||
        !email
    ) {

        toast(
            "Completa nombre y correo",
            "warning"
        );

        return;
    }

    app.usuario = {

        creado:
            true,

        nombre:
            name,

        correo:
            email
    };

    app.config.nombre =
        name;

    save();

    $("modalLogin")
        ?.classList
        .add("oculto");

    renderUser();

    updateGreeting();

    toast(
        `Bienvenido, ${name}`,
        "success"
    );
}

function logoutLocal() {

    app.usuario = {

        creado:
            false,

        nombre:
            "",

        correo:
            ""
    };

    save();

    renderUser();

    toast(
        "Sesión local cerrada",
        "info"
    );
}

/* =========================================================
   EXPORTAR / IMPORTAR
   ========================================================= */

function exportData() {

    const blob =
        new Blob(
            [
                JSON.stringify(
                    app,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );

    const url =
        URL.createObjectURL(
            blob
        );

    const link =
        document.createElement(
            "a"
        );

    link.href =
        url;

    link.download =
        `habit-tracker-backup-${hoyISO()}.json`;

    document.body.appendChild(
        link
    );

    link.click();

    link.remove();

    URL.revokeObjectURL(
        url
    );

    toast(
        "Respaldo exportado",
        "success"
    );
}

function importData(file) {

    if (!file) {
        return;
    }

    const reader =
        new FileReader();

    reader.onload =
        event => {

            try {

                const data =
                    JSON.parse(
                        event.target.result
                    );

                app =
                    data;

                ensureData();

                save();

                location.reload();

            } catch {

                toast(
                    "Archivo JSON inválido",
                    "error"
                );
            }
        };

    reader.readAsText(
        file
    );
}


/* =========================================================
   REINICIAR DATOS
   ========================================================= */

function resetData() {

    confirmar(
        "¿Borrar todos tus datos, monedas, vidas, actividades e historial?"
    ).then(
        ok => {

            if (!ok) {
                return;
            }

            localStorage.clear();

            location.reload();
        }
    );
}


/* =========================================================
   CONFIGURACIÓN DE RACHA
   ========================================================= */

function setStreakMinimum(
    value,
    button
) {

    app.config.rachaMinima =
        Number(value) || 80;

    save();

    document
        .querySelectorAll(
            ".btn-racha"
        )
        .forEach(
            b =>
                b.classList.remove(
                    "active"
                )
        );

    button
        ?.classList
        .add("active");

    actualizarRacha();

    updateDashboard();
}


/* =========================================================
   NOTIFICACIONES
   ========================================================= */

function updateNotificationsUI() {

    const status =
        $("estadoNotis");

    const button =
        $("activarNotis");

    if (!status) {
        return;
    }

    if (
        !("Notification" in window)
    ) {

        status.textContent =
            "Este navegador no soporta notificaciones.";

        return;
    }

    const active =
        localStorage.getItem(
            "notisActivas"
        ) === "1";

    const time =
        localStorage.getItem(
            "horaRecordatorio"
        ) || "21:00";

    status.textContent =
        active
            ? `Recordatorios activos a las ${time}`
            : "Recordatorios desactivados";

    if (button) {

        button.textContent =
            active
                ? "Desactivar recordatorios"
                : "Activar recordatorios";
    }
}

async function sendNotification(
    title,
    body
) {

    if (
        !("Notification" in window) ||
        Notification.permission !==
            "granted"
    ) {
        return;
    }

    try {

        const registration =
            await navigator
                .serviceWorker
                ?.ready;

        if (
            registration?.showNotification
        ) {

            await registration
                .showNotification(
                    title,
                    {
                        body,
                        icon:
                            "h.png"
                    }
                );

        } else {

            new Notification(
                title,
                {
                    body
                }
            );
        }

    } catch {
        // Algunos navegadores
        // bloquean notificaciones.
    }
}

async function toggleNotifications() {

    if (
        !("Notification" in window)
    ) {

        toast(
            "Este navegador no soporta notificaciones",
            "warning"
        );

        return;
    }

    const active =
        localStorage.getItem(
            "notisActivas"
        ) === "1";

    if (active) {

        localStorage.setItem(
            "notisActivas",
            "0"
        );

        updateNotificationsUI();

        toast(
            "Recordatorios desactivados",
            "info"
        );

        return;
    }

    const permission =
        await Notification.requestPermission();

    if (
        permission !== "granted"
    ) {

        toast(
            "No se concedió permiso para notificaciones",
            "warning"
        );

        return;
    }

    localStorage.setItem(
        "notisActivas",
        "1"
    );

    localStorage.setItem(
        "horaRecordatorio",
        $("horaRecordatorio")
            ?.value ||
            "21:00"
    );

    updateNotificationsUI();

    toast(
        "Recordatorios activados",
        "success"
    );
}


/* =========================================================
   CONFETI
   ========================================================= */

function confetti() {

    const container =
        document.createElement(
            "div"
        );

    container.className =
        "confeti-container";

    for (
        let i = 0;
        i < 60;
        i++
    ) {

        const piece =
            document.createElement(
                "i"
            );

        piece.className =
            "confeti";

        piece.style.left =
            `${Math.random() * 100}vw`;

        piece.style.animationDelay =
            `${Math.random()}s`;

        container.appendChild(
            piece
        );
    }

    document.body.appendChild(
        container
    );

    setTimeout(
        () =>
            container.remove(),
        3200
    );
}


/* =========================================================
   ACTUALIZAR TODA LA APP
   ========================================================= */

function updateAll() {

    renderHabits();

    renderEditor();

    populateHabitSelector();

    updateDashboard();

    createCalendar();

    updateGreeting();

    renderStore();

    renderStatsExtras();

    renderUser();

    if ($("notaDia")) {

        $("notaDia").value =
            getRecord()?.nota ||
            "";
    }
}

function actualizarTodo() {
    updateAll();
}


/* =========================================================
   EVENTOS
   ========================================================= */

function bindEvents() {

    $("guardar")
        ?.addEventListener(
            "click",
            saveDay
        );

    $("agregarHabito")
        ?.addEventListener(
            "click",
            addHabit
        );

    $("guardarEditar")
        ?.addEventListener(
            "click",
            saveEdit
        );

    $("cancelarEditar")
        ?.addEventListener(
            "click",
            closeEdit
        );

    $("guardarJustificacion")
        ?.addEventListener(
            "click",
            saveJustification
        );

    $("cancelarJustificacion")
        ?.addEventListener(
            "click",
            () =>
                $("modalJustificacion")
                    ?.classList
                    .add("oculto")
        );

    $("modalEditar")
        ?.addEventListener(
            "click",
            e => {

                if (
                    e.target.id ===
                    "modalEditar"
                ) {
                    closeEdit();
                }
            }
        );

    $("modalJustificacion")
        ?.addEventListener(
            "click",
            e => {

                if (
                    e.target.id ===
                    "modalJustificacion"
                ) {

                    $("modalJustificacion")
                        ?.classList
                        .add("oculto");
                }
            }
        );

    $("modalDetalle")
        ?.addEventListener(
            "click",
            e => {

                if (
                    e.target.id ===
                    "modalDetalle"
                ) {

                    closeDetail();
                }
            }
        );

    $("selectorHabito")
        ?.addEventListener(
            "change",
            e =>
                analyzeHabit(
                    e.target.value
                )
        );


    /* =====================================================
       PESTAÑAS DE ESTADÍSTICAS
       ===================================================== */

    document
        .querySelectorAll(
            ".tabs button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".tabs button"
                            )
                            .forEach(
                                b =>
                                    b.classList.remove(
                                        "active"
                                    )
                            );

                        button.classList.add(
                            "active"
                        );

                        updateGeneralChart(
                            button.dataset.tipo
                        );
                    }
                );
            }
        );


    /* =====================================================
       MODO
       ===================================================== */

    $("modo")
        ?.addEventListener(
            "click",
            changeMode
        );


    /* =====================================================
       RACHA
       ===================================================== */

    document
        .querySelectorAll(
            ".btn-racha"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        setStreakMinimum(
                            button.dataset.min,
                            button
                        )
                );
            }
        );


    /* =====================================================
       TIEMPO EN PANTALLA
       ===================================================== */

    $("guardarPantalla")
        ?.addEventListener(
            "click",
            saveScreenTime
        );


    /* =====================================================
       EXPORTAR / IMPORTAR
       ===================================================== */

    $("exportar")
        ?.addEventListener(
            "click",
            exportData
        );

    $("importar")
        ?.addEventListener(
            "click",
            () =>
                $("archivoImportar")
                    ?.click()
        );

    $("archivoImportar")
        ?.addEventListener(
            "change",
            e =>
                importData(
                    e.target.files?.[0]
                )
        );

    $("reiniciar")
        ?.addEventListener(
            "click",
            resetData
        );


    /* =====================================================
   LOGIN
   ===================================================== */

$("btnLogin")
    ?.addEventListener(
        "click",
        () =>
            app.usuario.creado
                ? logoutLocal()
                : openLogin()
    );

// ← Añade esto aquí
$("btnLoginConfig")
    ?.addEventListener(
        "click",
        () =>
            app.usuario.creado
                ? logoutLocal()
                : openLogin()
    );

$("loginSubmit")
    ?.addEventListener(
        "click",
        loginLocal
    );

$("loginCancel")
    ?.addEventListener(
        "click",
        () =>
            $("modalLogin")
                ?.classList
                .add("oculto")
    );


    /* =====================================================
       CASTIGO
       ===================================================== */

    $("cumplirCastigo")
        ?.addEventListener(
            "click",
            completePunishment
        );

    $("configCastigo")
        ?.addEventListener(
            "change",
            e => {

                app.config.castigo =
                    e.target.value;

                save();
            }
        );


    /* =====================================================
       NOTIFICACIONES
       ===================================================== */

    $("activarNotis")
        ?.addEventListener(
            "click",
            toggleNotifications
        );

    $("probarNoti")
        ?.addEventListener(
            "click",
            async () => {

                if (
                    !("Notification" in window)
                ) {
                    return;
                }

                const permission =
                    Notification.permission ===
                    "granted"

                        ? "granted"

                        : await Notification
                            .requestPermission();

                if (
                    permission ===
                    "granted"
                ) {

                    await sendNotification(
                        "Habit Tracker",
                        "Las notificaciones funcionan 👍"
                    );
                }
            }
        );

    $("horaRecordatorio")
        ?.addEventListener(
            "change",
            e => {

                localStorage.setItem(
                    "horaRecordatorio",
                    e.target.value
                );

                updateNotificationsUI();
            }
        );


    /* =====================================================
       MODO GUARDADO
       ===================================================== */

    const savedMode =
        localStorage.getItem(
            "modo"
        );

    if (
        savedMode ===
        "claro"
    ) {

        document.body.classList.add(
            "light"
        );
    }

    /* =====================================================
   BOTÓN IR ARRIBA (móvil)
   ===================================================== */

const btnArriba = $("btnIrArriba");

if (btnArriba) {
    // Mostrar la flecha cuando el menú ya no se ve
    window.addEventListener("scroll", () => {
        // El menú suele ocupar ~180-220px de alto en móvil
        const umbral = 220;

        if (window.scrollY > umbral) {
            btnArriba.classList.add("visible");
        } else {
            btnArriba.classList.remove("visible");
        }
    });

    // Al hacer clic, subir suavemente
    btnArriba.addEventListener("click", () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
}
}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

function initialize() {

    migrate();

    bindEvents();

    initDayButtons();


    if ($("configCastigo")) {

        $("configCastigo").value =
            app.config.castigo ||
            "400 lagartijas";
    }

    if ($("horaRecordatorio")) {

        $("horaRecordatorio").value =
            localStorage.getItem(
                "horaRecordatorio"
            ) ||
            "21:00";
    }


    document
        .querySelectorAll(
            ".btn-racha"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",

                    Number(
                        button.dataset.min
                    ) ===
                    Number(
                        app.config
                            .rachaMinima
                    )
                );
            }
        );


    processYesterday();

    actualizarRacha();

    updateAll();

    setTimeout(checkPendingJustifications, 1000);

    updateNotificationsUI();
}


/* =========================================================
   COMPATIBILIDAD CON onclick DEL HTML
   ========================================================= */

window.mostrar =
    mostrar;

window.mesAnterior =
    mesAnterior;

window.mesSiguiente =
    mesSiguiente;

window.cerrarDetalle =
    closeDetail;

window.cambiarModo =
    cambiarModo;


/* =========================================================
   SERVICE WORKER
   ========================================================= */

if (
    "serviceWorker" in
    navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register(
                    "./sw.js"
                )
                .catch(
                    error => {

                        console.warn(
                            "Service Worker no disponible:",
                            error
                        );
                    }
                );
        }
    );
}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initialize
);

/* =========================================================
   V4 - LOGIN REAL + SINCRONIZACIÓN + RETOS PERSONALIZADOS
   ========================================================= */

const SUPABASE_URL = "https://wzqshgnhphkmrilwxdos.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ErqnMnu8d1JySVNApTnG2w_TZZykOuL";
let supabaseClient = null;
let authMode = "login";
let editingChallenge = null;

function supabaseConfigured() {
    return SUPABASE_URL.startsWith("https://") &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_ANON_KEY.startsWith("PEGA_AQUI");
}

function initSupabase() {
    if (!supabaseConfigured()) return false;
    if (!window.supabase?.createClient) return false;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
}

async function getCloudSession() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session || null;
}

async function syncToCloud() {
    if (!supabaseClient) return;
    const session = await getCloudSession();
    if (!session?.user?.id) return;

    const payload = clone(app);
    payload.usuario = {
        creado: true,
        nombre: app.usuario.nombre || session.user.user_metadata?.nombre || "",
        correo: session.user.email || app.usuario.correo || ""
    };

    const { error } = await supabaseClient
        .from("habit_tracker_data")
        .upsert({
            user_id: session.user.id,
            data: payload,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

    if (error) console.warn("No se pudo sincronizar:", error.message);
}

async function loadFromCloud(userId) {
    if (!supabaseClient || !userId) return false;

    const { data, error } = await supabaseClient
        .from("habit_tracker_data")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.warn("No se pudo cargar la nube:", error.message);
        return false;
    }

    if (!data?.data) return false;

    app = data.data;
    ensureData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    return true;
}

async function saveCloudNow() {
    save();
    await syncToCloud();
}

async function loginLocal() {
    if (!supabaseClient) {
        toast("Configura Supabase para activar el inicio de sesión real.", "warning");
        return;
    }

    const name = $("loginNombre")?.value.trim() || "";
    const email = $("loginEmail")?.value.trim() || "";
    const password = $("loginPassword")?.value || "";

    if (!email || !password) {
        toast("Correo y contraseña son obligatorios", "warning");
        return;
    }

    if (authMode === "signup" && (!name || password.length < 6)) {
        toast("Para registrarte necesitas nombre y una contraseña de mínimo 6 caracteres", "warning");
        return;
    }

    const button = $("loginSubmit");
    if (button) button.disabled = true;

    try {
        let result;
        if (authMode === "signup") {
            result = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { nombre: name } }
            });
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }

        if (result.error) throw result.error;

        const session = result.data?.session;
        if (!session) {
            toast("Revisa tu correo para confirmar la cuenta y después inicia sesión.", "info", 5000);
            $("modalLogin")?.classList.add("oculto");
            return;
        }

        const cloudHadData = await loadFromCloud(session.user.id);

        if (!cloudHadData) {
            app.usuario = {
                creado: true,
                nombre: name || session.user.user_metadata?.nombre || "",
                correo: session.user.email || email
            };
            app.config.nombre = app.usuario.nombre;
            ensureData();
            await syncToCloud();
        } else {
            app.usuario.creado = true;
            app.usuario.correo = session.user.email || email;
            app.usuario.nombre = app.usuario.nombre || session.user.user_metadata?.nombre || "";
            save();
        }

        $("modalLogin")?.classList.add("oculto");
        updateAll();
        toast(`Bienvenido${app.usuario.nombre ? `, ${app.usuario.nombre}` : ""} 👋`, "success");
    } catch (error) {
        console.error(error);
        const message = String(error.message || "");
        toast(message.includes("Invalid login credentials") ? "Correo o contraseña incorrectos" : message || "No se pudo iniciar sesión", "error", 5000);
    } finally {
        if (button) button.disabled = false;
    }
}

async function logoutLocal() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    app.usuario = { creado: false, nombre: "", correo: "" };
    save();
    renderUser();
    toast("Sesión cerrada", "info");
}

function openLogin() {
    authMode = "login";
    updateLoginModeUI();
    $("modalLogin")?.classList.remove("oculto");
}

function updateLoginModeUI() {
    const signup = authMode === "signup";
    if ($("loginNombre")) {
        $("loginNombre").style.display = signup ? "block" : "none";
        $("loginNombre").required = signup;
    }
    if ($("loginSubmit")) $("loginSubmit").textContent = signup ? "Crear cuenta" : "Entrar";
    if ($("loginModeBtn")) $("loginModeBtn").textContent = signup ? "¿Ya tienes cuenta? Iniciar sesión" : "¿No tienes cuenta? Crear una";
    if ($("loginHelp")) $("loginHelp").textContent = signup
        ? "Crea tu cuenta con correo y contraseña. Después podrás usar tus datos en otros dispositivos."
        : "Entra con tu correo y contraseña para recuperar tus datos sincronizados.";
}

async function bootRealAuth() {
    initSupabase();

    if (!supabaseClient) {
        const status = $("userStatus");
        if (status) status.innerHTML = "Sin sesión <span class=\"account-cloud\">☁️ Login real pendiente de configurar</span>";
        return;
    }

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        if (!session) {
            app.usuario = { creado: false, nombre: "", correo: "" };
            save();
            renderUser();
            return;
        }

        const hadData = await loadFromCloud(session.user.id);
        if (!hadData) {
            app.usuario = {
                creado: true,
                nombre: session.user.user_metadata?.nombre || app.config.nombre || "",
                correo: session.user.email || ""
            };
            app.config.nombre = app.usuario.nombre;
            await syncToCloud();
        } else {
            app.usuario.creado = true;
            app.usuario.correo = session.user.email || app.usuario.correo;
            save();
        }
        updateAll();
    });

    const session = await getCloudSession();
    if (session) {
        const hadData = await loadFromCloud(session.user.id);
        if (!hadData) {
            app.usuario.creado = true;
            app.usuario.correo = session.user.email || "";
            await syncToCloud();
        }
        updateAll();
    }
}

/* Guardado: local siempre + nube cuando hay sesión. */
const originalSaveForCloud = save;
save = function saveWithCloud() {
    originalSaveForCloud();
    if (supabaseClient) {
        clearTimeout(save.cloudTimer);
        save.cloudTimer = setTimeout(() => syncToCloud(), 500);
    }
};

/* =========================================================
   RETOS PERSONALIZADOS
   ========================================================= */

function ensureCustomChallenges() {
    if (!app.retos || typeof app.retos !== "object") app.retos = {};
    if (!Array.isArray(app.retos.custom)) app.retos.custom = [];
}

function challengeCurrent(challenge) {
    return Math.max(0, Number(challenge.progreso) || 0);
}

function renderChallenges() {
    ensureCustomChallenges();
    const monthlyBox = $("retosMensuales");
    const annualBox = $("retosAnuales");
    if (!monthlyBox || !annualBox) return;

    monthlyBox.innerHTML = "";
    annualBox.innerHTML = "";

    const custom = app.retos.custom;
    const monthlyCustom = custom.filter(x => x.tipo === "mensual");
    const annualCustom = custom.filter(x => x.tipo === "anual");

    renderBuiltInChallenges(monthlyBox, "month");
    renderBuiltInChallenges(annualBox, "year");
    monthlyCustom.forEach(c => renderCustomChallenge(monthlyBox, c));
    annualCustom.forEach(c => renderCustomChallenge(annualBox, c));

    if (!monthlyCustom.length && !annualCustom.length) {
        // Los retos automáticos siguen apareciendo; no hace falta mostrar un vacío.
    }
    originalSaveForCloud();
}

function renderBuiltInChallenges(box, scope) {
    const now = dateObj(hoyISO());
    const key = scope === "month"
        ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
        : String(now.getFullYear());

    const collection = scope === "month" ? app.retos.mensuales : app.retos.anuales;
    if (!collection[key]) collection[key] = scope === "month" ? generateMonthlyChallenge(key) : generateAnnualChallenge(key);
    const challenge = collection[key];

    challenge.goals.forEach(goal => {
        const value = Math.min(goal.target, challengeValue(goal.id, scope));
        const percent = Math.round(value / goal.target * 100);
        const item = document.createElement("div");
        item.className = "reto-item";
        item.innerHTML = `
            <div class="reto-header"><strong class="reto-title">${escapeHtml(goal.text)}</strong><span>${value}/${goal.target}</span></div>
            <div class="reto-progress"><div class="reto-progress-bar" style="width:${percent}%"></div></div>
            <div class="reto-bottom"><span>${percent}%</span><span>Automático</span></div>
        `;
        box.appendChild(item);
    });
}

function renderCustomChallenge(box, challenge) {
    const current = Math.min(challenge.meta, challengeCurrent(challenge));
    const percent = Math.min(100, Math.round(current / challenge.meta * 100));
    const done = current >= challenge.meta;

    const item = document.createElement("div");
    item.className = "reto-item";
    item.innerHTML = `
        <div class="reto-header">
            <strong class="reto-title">${escapeHtml(challenge.nombre)}</strong>
            <span class="reto-reward">+${challenge.recompensa} $</span>
        </div>
        ${challenge.descripcion ? `<div class="reto-desc">${escapeHtml(challenge.descripcion)}</div>` : ""}
        <div class="reto-progress"><div class="reto-progress-bar" style="width:${percent}%"></div></div>
        <div class="reto-bottom">
            <span>${current}/${challenge.meta}${challenge.unidad ? ` ${escapeHtml(challenge.unidad)}` : ""}</span>
            <span>${done ? "✅ Completado" : `${percent}%`}</span>
        </div>
        <div class="reto-actions">
            <button class="reto-minus">−1</button>
            <button class="reto-plus">+1</button>
            <button class="reto-edit">Editar</button>
            <button class="danger reto-delete">Eliminar</button>
        </div>
    `;

    item.querySelector(".reto-plus").onclick = () => changeCustomChallengeProgress(challenge.id, 1);
    item.querySelector(".reto-minus").onclick = () => changeCustomChallengeProgress(challenge.id, -1);
    item.querySelector(".reto-edit").onclick = () => openChallengeForm(challenge);
    item.querySelector(".reto-delete").onclick = () => deleteCustomChallenge(challenge.id);
    box.appendChild(item);
}

function openChallengeForm(challenge = null) {
    editingChallenge = challenge?.id || null;
    $("retoForm")?.classList.remove("oculto");
    $("retoFormTitulo").textContent = challenge ? "Editar reto" : "Crear reto";
    $("retoNombre").value = challenge?.nombre || "";
    $("retoDescripcion").value = challenge?.descripcion || "";
    $("retoMeta").value = challenge?.meta || "";
    $("retoUnidad").value = challenge?.unidad || "";
    $("retoRecompensa").value = challenge?.recompensa ?? 100;
    $("retoTipo").value = challenge?.tipo || "mensual";
    $("retoNombre")?.focus();
}

function closeChallengeForm() {
    editingChallenge = null;
    $("retoForm")?.classList.add("oculto");
}

function saveCustomChallenge() {
    ensureCustomChallenges();
    const nombre = $("retoNombre")?.value.trim() || "";
    const descripcion = $("retoDescripcion")?.value.trim() || "";
    const meta = Math.max(1, Number($("retoMeta")?.value || 0));
    const unidad = $("retoUnidad")?.value.trim() || "";
    const recompensa = Math.max(0, Number($("retoRecompensa")?.value || 0));
    const tipo = $("retoTipo")?.value === "anual" ? "anual" : "mensual";

    if (!nombre || !Number.isFinite(meta) || meta < 1) {
        toast("Pon un nombre y una meta válida", "warning");
        return;
    }

    if (editingChallenge) {
        const c = app.retos.custom.find(x => x.id === editingChallenge);
        if (c) {
            c.nombre = nombre;
            c.descripcion = descripcion;
            c.meta = meta;
            c.unidad = unidad;
            c.recompensa = recompensa;
            c.tipo = tipo;
            c.progreso = Math.min(Number(c.progreso) || 0, meta);
        }
        toast("Reto actualizado", "success");
    } else {
        app.retos.custom.push({
            id: uid("challenge"),
            nombre,
            descripcion,
            meta,
            progreso: 0,
            unidad,
            recompensa,
            tipo,
            creado: hoyISO(),
            recompensaEntregada: false
        });
        toast("Reto creado", "success");
    }

    save();
    closeChallengeForm();
    renderChallenges();
}

function changeCustomChallengeProgress(id, amount) {
    ensureCustomChallenges();
    const c = app.retos.custom.find(x => x.id === id);
    if (!c) return;

    const before = Math.min(c.meta, Math.max(0, Number(c.progreso) || 0));
    c.progreso = Math.min(c.meta, Math.max(0, before + amount));

    if (c.progreso >= c.meta && !c.recompensaEntregada) {
        app.economia.monedas += Number(c.recompensa) || 0;
        c.recompensaEntregada = true;
        toast(`🏆 Reto completado. +${c.recompensa} monedas`, "success");
    }

    if (c.progreso < c.meta) c.recompensaEntregada = false;
    save();
    renderChallenges();
    updateDashboard();
}

async function deleteCustomChallenge(id) {
    const ok = await confirmar("¿Eliminar este reto?");
    if (!ok) return;
    app.retos.custom = (app.retos.custom || []).filter(x => x.id !== id);
    save();
    renderChallenges();
    toast("Reto eliminado", "info");
}

/* =========================================================
   INICIO DE LA CAPA V4
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    ensureCustomChallenges();
    updateLoginModeUI();

    $("nuevoRetoBtn")?.addEventListener("click", () => openChallengeForm());
    $("cancelarReto")?.addEventListener("click", closeChallengeForm);
    $("guardarReto")?.addEventListener("click", saveCustomChallenge);

    $("loginModeBtn")?.addEventListener("click", () => {
        authMode = authMode === "login" ? "signup" : "login";
        updateLoginModeUI();
    });

    $("modalLogin")?.addEventListener("click", e => {
        if (e.target.id === "modalLogin") $("modalLogin").classList.add("oculto");
    });

    bootRealAuth();
});

/* =========================================================
   PREGUNTAR JUSTIFICACIÓN
   ========================================================= */

function checkPendingJustifications() {

    const habits = getTodayHabits();
    const record = getRecord();

    for (const habit of habits) {

        if (!habit.horaMax) continue;

        const status = record?.habitos?.[habit.id] || { estado: "pendiente" };

        // Solo si ya pasó la hora y sigue pendiente
        if (
            passedMaxTime(habit) &&
            status.estado === "pendiente"
        ) {
            // Evitar preguntar varias veces el mismo día
            const key = `asked_justif_${hoyISO()}_${habit.id}`;
            if (localStorage.getItem(key)) continue;

            localStorage.setItem(key, "1");

            // Preguntar
            setTimeout(() => {
                confirmar(
                    `Ya pasó la hora de "${habit.nombre}".\n\n¿Quieres justificarla para proteger tu racha?`
                ).then(ok => {
                    if (ok) {
                        openJustification(habit.id);
                    }
                });
            }, 600);

            // Solo preguntamos una por vez
            break;
        }
    }
}