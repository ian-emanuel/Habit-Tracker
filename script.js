/*==================================================
        HABIT TRACKER PRO
        SCRIPT.JS COMPLETO + MEJORAS
==================================================*/


//==================================================
// OBJETO PRINCIPAL
//==================================================

const app = {
    habitos: [],
    diaSeleccionado: "todos",
    historial: [],
    racha: {
        actual: 0,
        mejor: 0,
        ultimaFecha: null
    },
    config: {
        nombre: "",
        rachaMinima: 80
    }
};

// Para deshacer eliminación
let ultimoEliminado = null;
let timeoutDeshacer = null;


//==================================================
// SISTEMA DE TOASTS
//==================================================

function mostrarToast(mensaje, tipo = "info", duracion = 3000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;

    const iconos = {
        success: "✅",
        error: "❌",
        warning: "⚠️",
        info: "ℹ️"
    };

    toast.innerHTML = `<span>${iconos[tipo] || "ℹ️"}</span><span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), duracion);
}


//==================================================
// MODAL DE CONFIRMACIÓN
//==================================================

function confirmar(mensaje) {
    return new Promise((resolve) => {
        const modal = document.getElementById("modalConfirm");
        const texto = document.getElementById("modalConfirmTexto");
        const btnAceptar = document.getElementById("modalAceptar");
        const btnCancelar = document.getElementById("modalCancelar");

        if (!modal) {
            resolve(window.confirm(mensaje));
            return;
        }

        texto.textContent = mensaje;
        modal.classList.remove("oculto");

        const cerrar = (resultado) => {
            modal.classList.add("oculto");
            btnAceptar.onclick = null;
            btnCancelar.onclick = null;
            resolve(resultado);
        };

        btnAceptar.onclick = () => cerrar(true);
        btnCancelar.onclick = () => cerrar(false);
    });
}


//==================================================
// CARGAR DATOS
//==================================================

function cargarDatos() {
    const datos = JSON.parse(localStorage.getItem("habitTracker"));

    if (datos) {
        app.habitos = datos.habitos || [];
        app.historial = datos.historial || [];
        app.racha = datos.racha || {
            actual: 0,
            mejor: 0,
            ultimaFecha: null
        };
    }

    app.config = Object.assign(
    { nombre: "", rachaMinima: 80 },
    datos?.config || {}
    );

    if (app.config.rachaMinima !== 80 && app.config.rachaMinima !== 100) {
        app.config.rachaMinima = 80;
    }

    // Migrar hábitos antiguos
    app.habitos = app.habitos.map(h => {
        if (h.dias) return h;
        if (h.dia) return { nombre: h.nombre, dias: [h.dia] };
        return h;
    });

    if (app.habitos.length === 0) {
        app.habitos = [
            { nombre: "💧 Beber agua", dias: ["todos"] },
            { nombre: "🏋️ Hacer ejercicio", dias: ["lunes"] },
            { nombre: "📚 Leer", dias: ["martes"] },
            { nombre: "😴 Dormir 8 horas", dias: ["todos"] },
            { nombre: "🎯 Trabajar en mi meta", dias: ["sabado"] }
        ];
        guardarDatos();
    }
}


//==================================================
// GUARDAR DATOS
//==================================================

function guardarDatos() {
    localStorage.setItem("habitTracker", JSON.stringify(app));
}


//==================================================
// ELEMENTOS HTML
//==================================================

const elementos = {
    listaHabitos: document.getElementById("listaHabitos"),
    listaEditar: document.getElementById("listaEditar"),
    nuevoHabito: document.getElementById("nuevoHabito"),
    porcentaje: document.getElementById("porcentajeHoy"),
    contador: document.getElementById("contadorHabitos"),
    racha: document.getElementById("racha"),
    mejorRacha: document.getElementById("mejorRacha")
};


//==================================================
// SELECTOR DE DÍAS
//==================================================

function inicializarSelectorDias() {
    document.querySelectorAll(".dia-btn:not(.edit-dia)").forEach(btn => {
        btn.addEventListener("click", () => {
            const dia = btn.dataset.dia;

            if (dia === "todos") {
                document.querySelectorAll(".dia-btn:not(.edit-dia)").forEach(b => b.classList.remove("activo"));
                btn.classList.add("activo");
            } else {
                document.querySelector('.dia-btn[data-dia="todos"]:not(.edit-dia)')?.classList.remove("activo");
                btn.classList.toggle("activo");
            }
        });
    });
}

function obtenerDiasSeleccionados(selector = ".dia-btn:not(.edit-dia).activo") {
    const activos = document.querySelectorAll(selector);
    if (activos.length === 0) return [];

    const dias = Array.from(activos).map(b => b.dataset.dia);
    if (dias.includes("todos")) return ["todos"];
    return dias;
}

function limpiarSelectorDias() {
    document.querySelectorAll(".dia-btn:not(.edit-dia)").forEach(b => b.classList.remove("activo"));
}


//==================================================
// OBTENER HÁBITOS DE HOY
//==================================================

function obtenerHabitosHoy() {
    const fecha = new Date();
    const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    const diaActual = dias[fecha.getDay()];

    return app.habitos.filter(h => {
        const diasHabito = h.dias || (h.dia ? [h.dia] : []);
        return diasHabito.includes("todos") || diasHabito.includes(diaActual);
    });
}


//==================================================
// CREAR LISTA DE HÁBITOS
//==================================================

function crearHabitos() {
    elementos.listaHabitos.innerHTML = "";

    const habitosHoy = obtenerHabitosHoy();

    if (habitosHoy.length === 0) {
        elementos.listaHabitos.innerHTML = `
            <div class="vacio-habitos">
                No tienes hábitos para hoy 🌱<br>
                <small>Ve a Editar para añadir o cambiar los días</small>
            </div>
        `;
        return;
    }

    habitosHoy.forEach((habito, index) => {
        const div = document.createElement("div");
        div.className = "habito";
        div.dataset.index = index;

        div.innerHTML = `
            <input type="checkbox" id="habito-${index}">
            <label for="habito-${index}">${habito.nombre}</label>
        `;

        const checkbox = div.querySelector("input");
        checkbox.addEventListener("change", () => {
            div.classList.toggle("completado", checkbox.checked);

            // Vibración corta en móvil
            if (checkbox.checked && navigator.vibrate) {
                navigator.vibrate(25);
            }
        });

        elementos.listaHabitos.appendChild(div);
    });
}


//==================================================
// PANEL DE EDICIÓN + DRAG & DROP + EDITAR
//==================================================

function crearEditor() {
    elementos.listaEditar.innerHTML = "";

    app.habitos.forEach((habito, index) => {
        const div = document.createElement("div");
        div.className = "editarHabito";
        div.draggable = true;
        div.dataset.index = index;

        const dias = habito.dias || (habito.dia ? [habito.dia] : []);
        const textoDias = dias.includes("todos")
            ? "Todos los días"
            : dias.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");

        div.innerHTML = `
            <span class="drag-handle">⠿</span>
            <span style="flex:1">${habito.nombre} <small style="opacity:0.7">(${textoDias})</small></span>
            <button class="btn-editar" onclick="abrirEditar(${index})">Editar</button>
            <button onclick="eliminarHabito(${index})">Eliminar</button>
        `;

        // Drag & drop
        div.addEventListener("dragstart", (e) => {
            div.classList.add("dragging");
            e.dataTransfer.setData("text/plain", index);
        });

        div.addEventListener("dragend", () => {
            div.classList.remove("dragging");
        });

        div.addEventListener("dragover", (e) => e.preventDefault());

        div.addEventListener("drop", (e) => {
            e.preventDefault();
            const fromIndex = Number(e.dataTransfer.getData("text/plain"));
            const toIndex = Number(div.dataset.index);
            if (fromIndex === toIndex) return;

            const [moved] = app.habitos.splice(fromIndex, 1);
            app.habitos.splice(toIndex, 0, moved);

            guardarDatos();
            crearEditor();
            crearHabitos();
            crearSelectorHabitos();
            mostrarToast("Hábitos reordenados", "success");
        });

        elementos.listaEditar.appendChild(div);
    });
}


//==================================================
// EDITAR HÁBITO (versión corregida)
//==================================================

let indiceEditando = null;

function abrirEditar(index) {
    indiceEditando = index;
    const habito = app.habitos[index];
    const modal = document.getElementById("modalEditar");

    if (!modal) {
        mostrarToast("No se encontró el modal de editar", "error");
        return;
    }

    // Nombre
    const inputNombre = document.getElementById("editarNombre");
    if (inputNombre) inputNombre.value = habito.nombre;

    // Limpiar días
    document.querySelectorAll(".edit-dia").forEach(b => b.classList.remove("activo"));

    // Marcar los días del hábito
    const dias = habito.dias || [];
    dias.forEach(d => {
        const btn = document.querySelector(`.edit-dia[data-dia="${d}"]`);
        if (btn) btn.classList.add("activo");
    });

    // Volver a enlazar los botones de días (importante)
    document.querySelectorAll(".edit-dia").forEach(btn => {
        btn.onclick = function () {
            const dia = this.dataset.dia;

            if (dia === "todos") {
                document.querySelectorAll(".edit-dia").forEach(b => b.classList.remove("activo"));
                this.classList.add("activo");
            } else {
                document.querySelector('.edit-dia[data-dia="todos"]')?.classList.remove("activo");
                this.classList.toggle("activo");
            }
        };
    });

    // Mostrar modal
    modal.classList.remove("oculto");
}

function cerrarEditar() {
    const modal = document.getElementById("modalEditar");
    if (modal) modal.classList.add("oculto");
    indiceEditando = null;
}

function guardarEdicion() {
    if (indiceEditando === null) return;

    const nombre = document.getElementById("editarNombre")?.value.trim();
    if (!nombre) {
        mostrarToast("Escribe un nombre", "warning");
        return;
    }

    const activos = document.querySelectorAll(".edit-dia.activo");
    let dias = Array.from(activos).map(b => b.dataset.dia);

    if (dias.includes("todos")) dias = ["todos"];

    if (dias.length === 0) {
        mostrarToast("Selecciona al menos un día", "warning");
        return;
    }

    app.habitos[indiceEditando].nombre = nombre;
    app.habitos[indiceEditando].dias = dias;

    guardarDatos();
    crearHabitos();
    crearEditor();
    crearSelectorHabitos();

    cerrarEditar();
    mostrarToast("Hábito actualizado", "success");
}

// Enlazar botones UNA sola vez (al cargar)
document.getElementById("cancelarEditar")?.addEventListener("click", cerrarEditar);
document.getElementById("guardarEditar")?.addEventListener("click", guardarEdicion);

// Cerrar al hacer clic fuera del contenido
document.getElementById("modalEditar")?.addEventListener("click", (e) => {
    if (e.target.id === "modalEditar") {
        cerrarEditar();
    }
});


//==================================================
// AGREGAR HÁBITO
//==================================================

document.getElementById("agregarHabito")?.addEventListener("click", () => {
    const nombre = elementos.nuevoHabito.value.trim();
    if (nombre === "") {
        mostrarToast("Escribe el nombre del hábito", "warning");
        return;
    }

    

    const diasSeleccionados = obtenerDiasSeleccionados();
    if (diasSeleccionados.length === 0) {
        mostrarToast("Selecciona al menos un día", "warning");
        return;
    }

    app.habitos.push({
        nombre: nombre,
        dias: diasSeleccionados
    });

    guardarDatos();
    crearHabitos();
    crearEditor();
    crearSelectorHabitos();

    elementos.nuevoHabito.value = "";
    limpiarSelectorDias();
    mostrarToast("Hábito añadido", "success");
});


//==================================================
// ELIMINAR HÁBITO + DESHACER CON CLIC EN TOAST
//==================================================

async function eliminarHabito(index) {
    const ok = await confirmar("¿Quieres eliminar este hábito?");
    if (!ok) return;

    // Guardar para poder deshacer
    ultimoEliminado = {
        habito: { ...app.habitos[index] },
        index: index
    };

    app.habitos.splice(index, 1);
    guardarDatos();
    crearHabitos();
    crearEditor();
    crearSelectorHabitos();

    // Toast clickeable para deshacer
    mostrarToastDeshacer("Hábito eliminado. Clic para deshacer");
}

function mostrarToastDeshacer(mensaje) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    // Quitar toasts anteriores de deshacer
    container.querySelectorAll(".toast.deshacer").forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = "toast warning deshacer";
    toast.style.cursor = "pointer";
    toast.innerHTML = `<span>↩️</span><span>${mensaje}</span>`;

    // Clic en el toast → restaurar
    toast.addEventListener("click", () => {
        if (!ultimoEliminado) {
            mostrarToast("Ya no se puede deshacer", "info");
            toast.remove();
            return;
        }

        app.habitos.splice(ultimoEliminado.index, 0, ultimoEliminado.habito);
        guardarDatos();
        crearHabitos();
        crearEditor();
        crearSelectorHabitos();

        ultimoEliminado = null;
        clearTimeout(timeoutDeshacer);

        toast.remove();
        mostrarToast("Hábito restaurado", "success");
    });

    container.appendChild(toast);

    // Se elimina solo a los 5 segundos si no se usa
    clearTimeout(timeoutDeshacer);
    timeoutDeshacer = setTimeout(() => {
        ultimoEliminado = null;
        toast.remove();
    }, 5000);
}


//==================================================
// MOSTRAR PÁGINAS
//==================================================

function mostrar(id, boton) {
    document.querySelectorAll(".pagina").forEach(p => p.classList.add("oculto"));
    document.getElementById(id).classList.remove("oculto");

    document.querySelectorAll(".menu").forEach(b => b.classList.remove("active"));
    boton.classList.add("active");

    window.scrollTo({ top: 0, behavior: "smooth" });
}


//==================================================
// INICIAR APP
//==================================================

function iniciar() {
    cargarDatos();
    crearHabitos();
    crearEditor();
    inicializarSelectorDias();
}

iniciar();


/*==================================================
        PARTE 2: REGISTRO DIARIO + RACHA
==================================================*/

let fechaPrueba = null;

function fechaActual() {
    if (fechaPrueba) return fechaPrueba;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function obtenerHoy() {
    return app.historial.find(dia => dia.fecha === fechaActual());
}


//==================================================
// GUARDAR PROGRESO + NOTA + CONFETTI
//==================================================

document.getElementById("guardar")?.addEventListener("click", guardarDia);

function guardarDia() {
    let completados = 0;
    let lista = {};

    const habitosHoy = obtenerHabitosHoy();

    habitosHoy.forEach((habito, index) => {
        const check = document.getElementById(`habito-${index}`);
        const hecho = check ? check.checked : false;
        lista[habito.nombre] = hecho;
        if (hecho) completados++;
    });

    const porcentaje = Math.round((completados / (habitosHoy.length || 1)) * 100);

    const nota = document.getElementById("notaDia")?.value.trim() || "";

    const registro = {
        fecha: fechaActual(),
        porcentaje,
        completados,
        total: habitosHoy.length,
        habitos: lista,
        nota: nota
    };

    const posicion = app.historial.findIndex(d => d.fecha === registro.fecha);

    if (posicion !== -1) {
        app.historial[posicion] = registro;
    } else {
        app.historial.push(registro);
    }

    actualizarRacha();
    guardarDatos();
    actualizarDashboard();
    crearCalendario();

    // Cargar nota si existe
    if (document.getElementById("notaDia")) {
        document.getElementById("notaDia").value = nota;
    }

    mostrarToast("Progreso guardado correctamente", "success");

    // Celebración si llegó al 100%
    if (porcentaje === 100 && habitosHoy.length > 0) {
        lanzarConfeti();
        mostrarToast("¡Día perfecto! 🎉", "success", 4000);
    }
}

// Cargar nota al iniciar
function cargarNotaHoy() {
    const hoy = obtenerHoy();
    const textarea = document.getElementById("notaDia");
    if (textarea && hoy?.nota) {
        textarea.value = hoy.nota;
    }
}


//==================================================
// CONFETTI
//==================================================

function lanzarConfeti() {
    const container = document.createElement("div");
    container.className = "confeti-container";
    document.body.appendChild(container);

    const colores = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

    for (let i = 0; i < 60; i++) {
        const confeti = document.createElement("div");
        confeti.className = "confeti";
        confeti.style.left = Math.random() * 100 + "vw";
        confeti.style.background = colores[Math.floor(Math.random() * colores.length)];
        confeti.style.animationDelay = Math.random() * 0.8 + "s";
        confeti.style.transform = `rotate(${Math.random() * 360}deg)`;
        container.appendChild(confeti);
    }

    setTimeout(() => container.remove(), 3000);
}


//==================================================
// SISTEMA DE RACHA
//==================================================

function actualizarRacha() {
    const hoy = obtenerHoy();
    if (!hoy) return;

    const minimo = app.config?.rachaMinima ?? 80;

    if (hoy.porcentaje < minimo) {
        app.racha.actual = 0;
        app.racha.ultimaFecha = null;
        return;
    }

    if (app.racha.ultimaFecha === null) {
        app.racha.actual = 1;
        app.racha.ultimaFecha = hoy.fecha;
    } else if (app.racha.ultimaFecha === hoy.fecha) {
        return;
    } else {
        const ultima = new Date(app.racha.ultimaFecha);
        const actual = new Date(hoy.fecha);
        const diferencia = Math.floor((actual - ultima) / (1000 * 60 * 60 * 24));
        app.racha.actual = diferencia === 1 ? app.racha.actual + 1 : 1;
        app.racha.ultimaFecha = hoy.fecha;
    }

    if (app.racha.actual > app.racha.mejor) {
        app.racha.mejor = app.racha.actual;
    }
}


//==================================================
// ACTUALIZAR DASHBOARD
//==================================================

function actualizarDashboard() {
    const hoy = obtenerHoy();

    if (!hoy) {
        elementos.porcentaje.textContent = "0%";
        elementos.contador.textContent = `0 / ${obtenerHabitosHoy().length}`;
    } else {
        elementos.porcentaje.textContent = hoy.porcentaje + "%";
        elementos.contador.textContent = `${hoy.completados} / ${hoy.total}`;
    }

    elementos.racha.textContent = "🔥 " + app.racha.actual;
    elementos.mejorRacha.textContent = app.racha.mejor;
}


//==================================================
// CARGAR ESTADO DE HOY
//==================================================

function cargarHoy() {
    const hoy = obtenerHoy();
    if (!hoy) return;

    const habitosHoy = obtenerHabitosHoy();

    habitosHoy.forEach((habito, index) => {
        const check = document.getElementById(`habito-${index}`);
        if (check && hoy.habitos[habito.nombre]) {
            check.checked = true;
            check.closest(".habito")?.classList.add("completado");
        }
    });

    cargarNotaHoy();
}

actualizarDashboard();
setTimeout(() => cargarHoy(), 100);


/*==================================================
        PARTE 3: CALENDARIO
==================================================*/

let fechaCalendario = new Date();

const nombresMeses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function crearCalendario() {
    const calendario = document.getElementById("calendar");
    if (!calendario) return;

    calendario.innerHTML = "";

    const año = fechaCalendario.getFullYear();
    const mes = fechaCalendario.getMonth();

    document.getElementById("mesActual").textContent = `${nombresMeses[mes]} ${año}`;

    const primerDia = new Date(año, mes, 1).getDay();
    const diasMes = new Date(año, mes + 1, 0).getDate();
    let inicio = primerDia === 0 ? 6 : primerDia - 1;

    const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

    diasSemana.forEach(d => {
        const dia = document.createElement("div");
        dia.className = "nombreDia";
        dia.textContent = d;
        calendario.appendChild(dia);
    });

    for (let i = 0; i < inicio; i++) {
        const espacio = document.createElement("div");
        espacio.className = "dia vacio";
        calendario.appendChild(espacio);
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let primerRegistroDelMes = null;
    for (let d = 1; d <= diasMes; d++) {
        const fechaStr = `${año}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (app.historial.find(r => r.fecha === fechaStr)) {
            primerRegistroDelMes = d;
            break;
        }
    }

    for (let dia = 1; dia <= diasMes; dia++) {
        const fecha = `${año}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const registro = app.historial.find(d => d.fecha === fecha);

        const div = document.createElement("div");
        div.className = "dia";

        let contenido = `<strong>${dia}</strong>`;
        let porcentaje = null;

        if (registro) {
            porcentaje = registro.porcentaje;
        } else {
            const fechaActual = new Date(año, mes, dia);
            if (fechaActual <= hoy && primerRegistroDelMes !== null && dia < primerRegistroDelMes) {
                porcentaje = 0;
            }
        }

        if (porcentaje !== null) {
            contenido += `<span class="porcentajeDia">${porcentaje}%</span>`;
            if (porcentaje >= 80) div.classList.add("verde");
            else if (porcentaje >= 50) div.classList.add("amarillo");
            else div.classList.add("rojo");
        }

        div.innerHTML = contenido;

        div.onclick = () => {
            const fechaObj = new Date(fecha + "T12:00:00");
            const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
            app.diaSeleccionado = dias[fechaObj.getDay()];
            crearHabitos();
            mostrarDetalleDia(fecha);
        };

        calendario.appendChild(div);
    }
}

function mesAnterior() {
    fechaCalendario.setMonth(fechaCalendario.getMonth() - 1);
    crearCalendario();
}

function mesSiguiente() {
    fechaCalendario.setMonth(fechaCalendario.getMonth() + 1);
    crearCalendario();
}

function mostrarDetalleDia(fecha) {
    const dia = app.historial.find(d => d.fecha === fecha);

    if (!dia) {
        mostrarToast("No hay registros este día", "info");
        return;
    }

    // Fecha bonita
    const fechaObj = new Date(fecha + "T12:00:00");
    const opciones = { weekday: "long", day: "numeric", month: "long" };
    const fechaBonita = fechaObj.toLocaleDateString("es-ES", opciones);

    document.getElementById("detalleFecha").textContent = "📅 " + fechaBonita;
    document.getElementById("detallePorcentaje").textContent = dia.porcentaje + "%";

    // Lista de hábitos
    const contenedor = document.getElementById("detalleHabitos");
    contenedor.innerHTML = "";

    Object.entries(dia.habitos).forEach(([nombre, hecho]) => {
        const item = document.createElement("div");
        item.className = `detalle-item ${hecho ? "hecho" : "no-hecho"}`;
        item.innerHTML = `
            <span>${hecho ? "✅" : "❌"}</span>
            <span>${nombre}</span>
        `;
        contenedor.appendChild(item);
    });

    // Nota
    const notaDiv = document.getElementById("detalleNota");
    if (dia.nota && dia.nota.trim() !== "") {
        notaDiv.textContent = "📝 " + dia.nota;
        notaDiv.classList.remove("oculto");
    } else {
        notaDiv.classList.add("oculto");
    }

    // Mostrar modal
    document.getElementById("modalDetalle").classList.remove("oculto");
}

function cerrarDetalle() {
    document.getElementById("modalDetalle").classList.add("oculto");
}

// Cerrar al hacer clic fuera del modal
document.getElementById("modalDetalle")?.addEventListener("click", (e) => {
    if (e.target.id === "modalDetalle") {
        cerrarDetalle();
    }
});

crearCalendario();


/*==================================================
        PARTE 4: ESTADÍSTICAS Y GRÁFICAS
==================================================*/

let graficaGeneral = null;
let tipoGraficaActual = "semana";

function cambiarGrafica(tipo) {
    tipoGraficaActual = tipo;
    actualizarGrafica();
}

function actualizarGrafica() {
    let datos;
    if (tipoGraficaActual === "semana") datos = datosSemana();
    if (tipoGraficaActual === "mes") datos = datosMes();
    if (tipoGraficaActual === "año") datos = datosAño();
    crearGrafica(datos.labels, datos.valores, datos.titulo);
}

function crearGrafica(labels, valores, titulo) {
    const ctx = document.getElementById("graficaGeneral");
    if (!ctx) return;
    if (graficaGeneral) graficaGeneral.destroy();

    const esClaro = document.body.classList.contains("claro");

    graficaGeneral = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: titulo,
                data: valores,
                tension: 0.4,
                borderWidth: 3,
                fill: true,
                backgroundColor: esClaro ? "rgba(37,99,235,.15)" : "rgba(59,130,246,.2)",
                borderColor: esClaro ? "#2563eb" : "#3b82f6",
                pointBackgroundColor: esClaro ? "#2563eb" : "#60a5fa",
                pointBorderColor: "#fff",
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: esClaro ? "#0f172a" : "#e2e8f0"
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: esClaro ? "#334155" : "#94a3b8" },
                    grid: { color: esClaro ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.08)" }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: esClaro ? "#334155" : "#94a3b8" },
                    grid: { color: esClaro ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.08)" }
                }
            }
        }
    });
}

function datosSemana() {
    const hoy = new Date();
    const labels = [];
    const valores = [];
    const nombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    for (let i = 6; i >= 0; i--) {
        const fecha = new Date(hoy);
        fecha.setDate(hoy.getDate() - i);
        const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
        labels.push(`${nombres[fecha.getDay()]} ${fecha.getDate()}`);
        const registro = app.historial.find(d => d.fecha === fechaStr);
        valores.push(registro ? registro.porcentaje : 0);
    }

    return { labels, valores, titulo: "Últimos 7 días" };
}

function datosMes() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mes = hoy.getMonth();
    const diasEnMes = new Date(año, mes + 1, 0).getDate();

    const labels = [];
    const valores = [];

    for (let d = 1; d <= diasEnMes; d++) {
        const fechaStr = `${año}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        labels.push(String(d));
        const registro = app.historial.find(r => r.fecha === fechaStr);
        valores.push(registro ? registro.porcentaje : 0);
    }

    return {
        labels,
        valores,
        titulo: `${nombresMeses[mes]} ${año}`
    };
}

function datosAño() {
    const hoy = new Date();
    const año = hoy.getFullYear();
    const nombresMesesCortos = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    const labels = [];
    const valores = [];

    for (let m = 0; m < 12; m++) {
        labels.push(nombresMesesCortos[m]);
        const diasEnMes = new Date(año, m + 1, 0).getDate();
        let suma = 0;

        for (let d = 1; d <= diasEnMes; d++) {
            const fechaStr = `${año}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const registro = app.historial.find(r => r.fecha === fechaStr);
            suma += registro ? registro.porcentaje : 0;
        }

        valores.push(Math.round(suma / diasEnMes));
    }

    return { labels, valores, titulo: `Año ${año} (por meses)` };
}

setTimeout(() => actualizarGrafica(), 500);


/*==================================================
        PARTE 5: ESTADÍSTICAS POR HÁBITO
==================================================*/

let graficaHabito = null;
const selector = document.getElementById("selectorHabito");

function crearSelectorHabitos() {
    if (!selector) return;
    selector.innerHTML = `<option value="">Selecciona un hábito</option>`;
    app.habitos.forEach((habito, index) => {
        const opcion = document.createElement("option");
        opcion.value = index;
        opcion.textContent = habito.nombre;
        selector.appendChild(opcion);
    });
}

selector?.addEventListener("change", () => {
    const index = selector.value;
    if (index === "") return;
    analizarHabito(app.habitos[index].nombre);
});

function analizarHabito(nombre) {
    let veces = 0;
    app.historial.forEach(dia => {
        if (dia.habitos[nombre]) veces++;
    });

    const porcentaje = app.historial.length === 0 ? 0 : Math.round((veces / app.historial.length) * 100);

    document.getElementById("totalHabito").textContent = veces;
    document.getElementById("porcentajeHabito").textContent = porcentaje + "%";
    document.getElementById("rachaHabito").textContent = calcularRachaHabito(nombre);
    crearGraficaHabito(nombre);
}

function calcularRachaHabito(nombre) {
    let actual = 0, mejor = 0;
    const fechas = [...app.historial].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    fechas.forEach(dia => {
        if (dia.habitos[nombre]) {
            actual++;
            if (actual > mejor) mejor = actual;
        } else {
            actual = 0;
        }
    });
    return mejor;
}

function crearGraficaHabito(nombre) {
    const ctx = document.getElementById("graficaHabito");
    if (!ctx) return;
    if (graficaHabito) graficaHabito.destroy();

    const esClaro = document.body.classList.contains("claro");

    graficaHabito = new Chart(ctx, {
        type: "bar",
        data: {
            labels: app.historial.map(d => d.fecha),
            datasets: [{
                label: nombre,
                data: app.historial.map(d => d.habitos[nombre] ? 100 : 0),
                borderRadius: 8,
                backgroundColor: esClaro ? "#16a34a" : "#22c55e"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    labels: { color: esClaro ? "#0f172a" : "#e2e8f0" }
                }
            },
            scales: {
                x: {
                    ticks: { color: esClaro ? "#334155" : "#94a3b8" },
                    grid: { color: esClaro ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.08)" }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: esClaro ? "#334155" : "#94a3b8",
                        callback: v => v + "%"
                    },
                    grid: { color: esClaro ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.08)" }
                }
            }
        }
    });
}

crearSelectorHabitos();


/*==================================================
        PARTE 6: CONFIGURACIÓN
==================================================*/

document.getElementById("exportar")?.addEventListener("click", () => {
    const datos = JSON.stringify(app, null, 2);
    const archivo = new Blob([datos], { type: "application/json" });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "habit-tracker-backup.json";
    enlace.click();
    URL.revokeObjectURL(url);
    mostrarToast("Datos exportados", "success");
});

const archivoImportar = document.getElementById("archivoImportar");
document.getElementById("importar")?.addEventListener("click", () => archivoImportar?.click());

archivoImportar?.addEventListener("change", evento => {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = e => {
        try {
            const datos = JSON.parse(e.target.result);
            app.habitos = datos.habitos || [];
            app.historial = datos.historial || [];
            app.racha = datos.racha || { actual: 0, mejor: 0, ultimaFecha: null };
            guardarDatos();
            location.reload();
        } catch {
            mostrarToast("Error al importar el archivo", "error");
        }
    };
    lector.readAsText(archivo);
});

document.getElementById("reiniciar")?.addEventListener("click", async () => {
    const ok = await confirmar("¿Seguro que quieres borrar todos los datos?");
    if (!ok) return;
    localStorage.removeItem("habitTracker");
    location.reload();
});


//==================================================
// MODO OSCURO / CLARO
//==================================================

const botonModo = document.getElementById("modo");
let modo = localStorage.getItem("modo") || "oscuro";

function aplicarModo() {
    if (modo === "claro") document.body.classList.add("claro");
    else document.body.classList.remove("claro");
}

botonModo?.addEventListener("click", () => {
    modo = modo === "oscuro" ? "claro" : "oscuro";
    localStorage.setItem("modo", modo);
    aplicarModo();
    actualizarGrafica();          // ← redibuja la general
    // si hay un hábito seleccionado, también:
    const index = selector?.value;
    if (index !== "" && index != null) {
        analizarHabito(app.habitos[index].nombre);
    }
    mostrarToast(modo === "claro" ? "Modo claro activado" : "Modo oscuro activado", "info");
});

//==================================================
// CONFIG: NOMBRE + RACHA MÍNIMA
//==================================================

function actualizarSaludo() {
    const el = document.getElementById("saludo");
    if (!el) return;

    const nombre = (app.config?.nombre || "").trim();
    const hora = new Date().getHours();
    const base = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

    el.textContent = nombre ? `${base}, ${nombre} 👋` : `${base} 👋`;
}

function actualizarBotonesRacha() {
    const actual = app.config?.rachaMinima ?? 80;
    document.querySelectorAll(".btn-racha").forEach(btn => {
        btn.classList.toggle("activo", Number(btn.dataset.min) === actual);
    });
}

function inicializarConfigUI() {
    // Nombre
    const inputNombre = document.getElementById("inputNombre");
    if (inputNombre) inputNombre.value = app.config?.nombre || "";

    document.getElementById("guardarNombre")?.addEventListener("click", () => {
        const nombre = document.getElementById("inputNombre")?.value.trim() || "";
        app.config.nombre = nombre;
        guardarDatos();
        actualizarSaludo();
        mostrarToast(nombre ? `Hola, ${nombre}` : "Nombre borrado", "success");
    });

    // Racha mínima
    document.querySelectorAll(".btn-racha").forEach(btn => {
        btn.addEventListener("click", () => {
            app.config.rachaMinima = Number(btn.dataset.min);
            guardarDatos();
            actualizarBotonesRacha();
            mostrarToast(`Racha mínima: ${app.config.rachaMinima}%`, "success");
        });
    });

    actualizarBotonesRacha();
    actualizarSaludo();
}

// Llamar cuando la app ya cargó datos
inicializarConfigUI();

//==================================================
// NOTIFICACIONES / RECORDATORIO DIARIO
//==================================================

function actualizarUINotis() {
    const btn = document.getElementById("activarNotis");
    const el = document.getElementById("estadoNotis");
    const inputHora = document.getElementById("horaRecordatorio");

    const activas = localStorage.getItem("notisActivas") === "1";
    const hora = localStorage.getItem("horaRecordatorio") || "21:00";

    if (inputHora) inputHora.value = hora;

    if (btn) {
        if (activas && Notification.permission === "granted") {
            btn.textContent = "Desactivar recordatorios";
            btn.classList.add("btn-peligro");
        } else {
            btn.textContent = "Activar recordatorios";
            btn.classList.remove("btn-peligro");
        }
    }

    if (!el) return;

    if (!("Notification" in window)) {
        el.textContent = "Este navegador no soporta notificaciones.";
        return;
    }

    if (Notification.permission === "granted" && activas) {
        el.textContent = `Recordatorios activos a las ${hora}`;
    } else if (Notification.permission === "denied") {
        el.textContent = "Permiso denegado. Actívalo en la configuración del navegador.";
    } else {
        el.textContent = "Recordatorios desactivados";
    }
}

function pedirPermisoNotificaciones() {
    if (!("Notification" in window)) {
        mostrarToast("Tu navegador no soporta notificaciones", "warning");
        return Promise.resolve(false);
    }
    if (Notification.permission === "granted") return Promise.resolve(true);
    if (Notification.permission === "denied") {
        mostrarToast("Permiso bloqueado. Actívalo en el navegador", "warning");
        return Promise.resolve(false);
    }
    return Notification.requestPermission().then(p => p === "granted");
}

function enviarNotificacion(titulo, cuerpo) {
    if (Notification.permission !== "granted") return;

    const n = new Notification(titulo, {
        body: cuerpo,
        icon: "h.png",
        badge: "h.png",
        tag: "habit-reminder"
    });

    n.onclick = () => {
        window.focus();
        n.close();
    };
}

function programarRecordatorio() {
    if (window._habitNotiInterval) clearInterval(window._habitNotiInterval);

    const activas = localStorage.getItem("notisActivas") === "1";
    if (!activas || Notification.permission !== "granted") return;

    window._habitNotiInterval = setInterval(() => {
        const horaConfig = localStorage.getItem("horaRecordatorio") || "21:00";
        const ahora = new Date();
        const actual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
        const hoy = fechaActual();
        const yaEnvio = localStorage.getItem("ultimaNoti") === hoy;

        // Solo si es la hora, no se envió hoy, Y no hay registro guardado del día
        const yaGuardoHoy = !!obtenerHoy();

        if (actual === horaConfig && !yaEnvio && !yaGuardoHoy) {
            const pendientes = obtenerHabitosHoy().length;
            enviarNotificacion(
                "Habit Tracker",
                pendientes > 0
                    ? `Aún no guardaste el día. Tienes ${pendientes} hábito(s) pendiente(s).`
                    : "Aún no registraste tu progreso de hoy"
            );
            localStorage.setItem("ultimaNoti", hoy);
        }
    }, 30000);
}

document.getElementById("activarNotis")?.addEventListener("click", async () => {
    const activas = localStorage.getItem("notisActivas") === "1";

    // Si ya están activas → desactivar
    if (activas && Notification.permission === "granted") {
        localStorage.setItem("notisActivas", "0");
        if (window._habitNotiInterval) clearInterval(window._habitNotiInterval);
        actualizarUINotis();
        mostrarToast("Recordatorios desactivados", "info");
        return;
    }

    // Activar
    const ok = await pedirPermisoNotificaciones();
    if (!ok) {
        actualizarUINotis();
        return;
    }

    const hora = document.getElementById("horaRecordatorio")?.value || "21:00";
    localStorage.setItem("horaRecordatorio", hora);
    localStorage.setItem("notisActivas", "1");
    programarRecordatorio();
    actualizarUINotis();
    mostrarToast(`Recordatorios activados a las ${hora}`, "success");
});

document.getElementById("probarNoti")?.addEventListener("click", async () => {
    const ok = await pedirPermisoNotificaciones();
    if (!ok) return;
    enviarNotificacion("Habit Tracker", "Así se verá tu recordatorio diario 💪");
    mostrarToast("Notificación de prueba enviada", "info");
});

document.getElementById("horaRecordatorio")?.addEventListener("change", (e) => {
    localStorage.setItem("horaRecordatorio", e.target.value);
    if (localStorage.getItem("notisActivas") === "1") {
        programarRecordatorio();
        actualizarUINotis();
        mostrarToast(`Hora actualizada: ${e.target.value}`, "success");
    }
});

// Al cargar
actualizarUINotis();
programarRecordatorio();


document.getElementById("btnIrArriba")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});

const btnArriba = document.getElementById("btnIrArriba");
const sidebar = document.querySelector(".sidebar");

function actualizarBotonArriba() {
    if (!btnArriba || !sidebar) return;

    // Solo en móvil
    if (window.innerWidth > 900) {
        btnArriba.style.display = "none";
        return;
    }

    const rect = sidebar.getBoundingClientRect();
    // Si el menú ya salió por arriba de la pantalla
    const menuNoVisible = rect.bottom <= 0;

    btnArriba.style.display = menuNoVisible ? "flex" : "none";
}

window.addEventListener("scroll", actualizarBotonArriba, { passive: true });
window.addEventListener("resize", actualizarBotonArriba);
actualizarBotonArriba();

btnArriba?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});

//==================================================
// ACTUALIZAR TODO
//==================================================

function actualizarTodo() {
    crearHabitos();
    crearEditor();
    actualizarDashboard();
    crearCalendario();
    crearSelectorHabitos();
    actualizarGrafica();
}