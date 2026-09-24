```javascript
// =============================================================
// REFERENCIAS AL DOM
// =============================================================

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const btnStartCamera = document.getElementById('btnStartCamera');
const btnCapture = document.getElementById('btnCapture');
const btnReset = document.getElementById('btnReset');
const btnCalculate = document.getElementById('btnCalculate');

const realHeightInput = document.getElementById('realHeight');
const targetVolumeInput = document.getElementById('targetVolume');

const pointStatus = document.getElementById('pointStatus');

let stream = null;
let calibrationPoints = [];
let imageCaptured = false;
let capturedImageObj = null;

const PI = Math.PI;


// =============================================================
// CONFIGURACIÓN
// =============================================================

const NODOS_PERFIL = 30;
const NODOS_DATASET = 60;
const TOLERANCIA = 1e-4;
const MAX_ITERACIONES = 100;


// =============================================================
// 1. EXTRACCIÓN DEL PERFIL
// =============================================================

function extraerPerfilRealDeImagen(
    topPt,
    bottomPt,
    realHeightCm,
    maxRadiusPt,
    minRadiusPt
) {

    const n = NODOS_PERFIL;

    const alturaPixel = Math.abs(bottomPt.y - topPt.y);

    if (alturaPixel <= 0) {
        throw new Error("La tapa y la base deben tener diferente posición vertical.");
    }

    const cmPerPixel = realHeightCm / alturaPixel;

    const centerXPixel = (topPt.x + bottomPt.x) / 2;

    const maxRadiusPx = Math.abs(maxRadiusPt.x - centerXPixel);

    const minRadiusPx = Math.abs(minRadiusPt.x - centerXPixel);

    const maxRadiusCm = maxRadiusPx * cmPerPixel;
    const minRadiusCm = minRadiusPx * cmPerPixel;

    let rawNodes = [];

    for (let i = 0; i <= n; i++) {

        const currentY =
            bottomPt.y -
            (i * (bottomPt.y - topPt.y) / n);

        const z_i =
            i * (realHeightCm / n);

        let detectedRadiusPx = maxRadiusPx;

        const searchWidth = Math.max(
            10,
            Math.floor(maxRadiusPx * 1.3)
        );

        try {

            const imgDataRight = ctx.getImageData(
                Math.floor(centerXPixel),
                Math.floor(currentY),
                searchWidth,
                1
            ).data;

            let maxGrad = 0;
            let bestOffset = detectedRadiusPx;

            for (
                let px = 4;
                px < imgDataRight.length - 8;
                px += 4
            ) {

                const b1 =
                    (
                        imgDataRight[px] +
                        imgDataRight[px + 1] +
                        imgDataRight[px + 2]
                    ) / 3;

                const b2 =
                    (
                        imgDataRight[px + 4] +
                        imgDataRight[px + 5] +
                        imgDataRight[px + 6]
                    ) / 3;

                const grad = Math.abs(b2 - b1);

                if (grad > maxGrad) {
                    maxGrad = grad;
                    bestOffset = px / 4;
                }
            }

            if (maxGrad > 10) {
                detectedRadiusPx = bestOffset;
            }

        } catch (error) {
            // Se utiliza el radio máximo como respaldo.
        }

        let r_i = detectedRadiusPx * cmPerPixel;

        const limiteSuperior = maxRadiusCm * 1.08;
        const limiteInferior = Math.max(
            minRadiusCm * 0.90,
            maxRadiusCm * 0.10
        );

        r_i = Math.min(r_i, limiteSuperior);
        r_i = Math.max(r_i, limiteInferior);

        rawNodes.push({
            z: z_i,
            r: r_i
        });
    }


    // ---------------------------------------------------------
    // Incorporar explícitamente los puntos de radio máximo
    // y mínimo como nodos del perfil.
    // ---------------------------------------------------------

    const zMax =
        Math.abs(bottomPt.y - maxRadiusPt.y) * cmPerPixel;

    const zMin =
        Math.abs(bottomPt.y - minRadiusPt.y) * cmPerPixel;

    rawNodes.push({
        z: Math.max(0, Math.min(realHeightCm, zMax)),
        r: maxRadiusCm
    });

    rawNodes.push({
        z: Math.max(0, Math.min(realHeightCm, zMin)),
        r: minRadiusCm
    });


    // ---------------------------------------------------------
    // Ordenar por altura y eliminar duplicados
    // ---------------------------------------------------------

    rawNodes.sort((a, b) => a.z - b.z);

    const nodosOrdenados = [];

    rawNodes.forEach(nodo => {

        const ultimo =
            nodosOrdenados[nodosOrdenados.length - 1];

        if (!ultimo || Math.abs(ultimo.z - nodo.z) > 0.0001) {
            nodosOrdenados.push(nodo);
        }
    });

    return {
        rawNodes: nodosOrdenados,
        minRadiusCm,
        maxRadiusCm,
        zMin,
        zMax
    };
}


// =============================================================
// 2. SPLINE CÚBICO
// =============================================================

function calcularSplineCubico(nodes) {

    const n = nodes.length - 1;

    let a = nodes.map(p => p.r);

    let h = [];

    for (let i = 0; i < n; i++) {
        h[i] = nodes[i + 1].z - nodes[i].z;

        if (h[i] <= 0) {
            h[i] = 0.000001;
        }
    }

    let alpha = new Array(n + 1).fill(0);

    for (let i = 1; i < n; i++) {

        alpha[i] =
            (3 / h[i]) *
            (a[i + 1] - a[i])
            -
            (3 / h[i - 1]) *
            (a[i] - a[i - 1]);
    }

    let l = new Array(n + 1).fill(0);
    let mu = new Array(n + 1).fill(0);
    let z = new Array(n + 1).fill(0);

    l[0] = 1;

    for (let i = 1; i < n; i++) {

        l[i] =
            2 *
            (nodes[i + 1].z - nodes[i - 1].z)
            -
            h[i - 1] * mu[i - 1];

        if (Math.abs(l[i]) < 1e-12) {
            l[i] = 1e-12;
        }

        mu[i] = h[i] / l[i];

        z[i] =
            (alpha[i] - h[i - 1] * z[i - 1]) /
            l[i];
    }

    l[n] = 1;
    z[n] = 0;

    let c = new Array(n + 1).fill(0);
    let b = new Array(n).fill(0);
    let d = new Array(n).fill(0);

    for (let j = n - 1; j >= 0; j--) {

        c[j] =
            z[j] -
            mu[j] * c[j + 1];

        b[j] =
            (a[j + 1] - a[j]) / h[j]
            -
            h[j] *
            (c[j + 1] + 2 * c[j]) / 3;

        d[j] =
            (c[j + 1] - c[j]) /
            (3 * h[j]);
    }


    return function (zEval) {

        if (zEval <= nodes[0].z) {
            return nodes[0].r;
        }

        if (zEval >= nodes[n].z) {
            return nodes[n].r;
        }

        let i = 0;

        for (let j = 0; j < n; j++) {

            if (
                zEval >= nodes[j].z &&
                zEval <= nodes[j + 1].z
            ) {
                i = j;
                break;
            }
        }

        const dx =
            zEval - nodes[i].z;

        return (
            a[i]
            +
            b[i] * dx
            +
            c[i] * dx * dx
            +
            d[i] * dx * dx * dx
        );
    };
}


// =============================================================
// 3. INTEGRACIÓN SIMPSON 1/3
// =============================================================

function integrarSimpson(
    rFunc,
    zMin,
    zMax,
    numIntervalos = 80
) {

    if (zMin >= zMax) {
        return 0;
    }

    if (numIntervalos % 2 !== 0) {
        numIntervalos++;
    }

    const h =
        (zMax - zMin) /
        numIntervalos;

    let suma =
        Math.pow(rFunc(zMin), 2)
        +
        Math.pow(rFunc(zMax), 2);

    for (let i = 1; i < numIntervalos; i++) {

        const z =
            zMin + i * h;

        const r = Math.max(
            0,
            rFunc(z)
        );

        const factor =
            i % 2 === 0 ? 2 : 4;

        suma +=
            factor *
            Math.pow(r, 2);
    }

    return (
        PI *
        h /
        3 *
        suma
    );
}


// =============================================================
// 4. FUNCIÓN OBJETIVO
// =============================================================

function fObjetivo(
    h,
    vObjetivo,
    rFunc
) {

    return (
        integrarSimpson(
            rFunc,
            0,
            h,
            80
        )
        -
        vObjetivo
    );
}


// =============================================================
// 5. RESULTADO ESTANDARIZADO
// =============================================================

function crearResultado(
    nombre,
    altura,
    iteraciones,
    rFunc,
    vObjetivo,
    maxH,
    convergio,
    mensaje
) {

    altura = Math.max(
        0,
        Math.min(maxH, altura)
    );

    const volumen =
        integrarSimpson(
            rFunc,
            0,
            altura,
            80
        );

    const error =
        Math.abs(volumen - vObjetivo);

    return {
        metodo: nombre,
        altura,
        radio: Math.max(0, rFunc(altura)),
        volumen,
        error,
        iter: iteraciones,
        convergio,
        mensaje
    };
}


// =============================================================
// 6. BISECCIÓN
// =============================================================

function metodoBiseccion(
    vObjetivo,
    rFunc,
    maxH,
    tol = TOLERANCIA,
    maxIter = MAX_ITERACIONES
) {

    let a = 0;
    let b = maxH;

    let fa =
        fObjetivo(a, vObjetivo, rFunc);

    let fb =
        fObjetivo(b, vObjetivo, rFunc);

    if (fa === 0) {
        return crearResultado(
            "Bisección",
            a,
            0,
            rFunc,
            vObjetivo,
            maxH,
            true,
            "Convergió"
        );
    }

    if (fa * fb > 0) {
        return crearResultado(
            "Bisección",
            a,
            0,
            rFunc,
            vObjetivo,
            maxH,
            false,
            "No existe intervalo con cambio de signo"
        );
    }

    let c = (a + b) / 2;
    let fc = 0;

    let iter = 0;

    for (iter = 1; iter <= maxIter; iter++) {

        c = (a + b) / 2;

        fc =
            fObjetivo(
                c,
                vObjetivo,
                rFunc
            );

        if (
            Math.abs(fc) < tol ||
            Math.abs(b - a) / 2 < tol
        ) {

            return crearResultado(
                "Bisección",
                c,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        if (fa * fc < 0) {

            b = c;
            fb = fc;

        } else {

            a = c;
            fa = fc;
        }
    }

    return crearResultado(
        "Bisección",
        c,
        maxIter,
        rFunc,
        vObjetivo,
        maxH,
        false,
        "Máximo de iteraciones alcanzado"
    );
}


// =============================================================
// 7. FALSA POSICIÓN
// =============================================================

function metodoFalsaPosicion(
    vObjetivo,
    rFunc,
    maxH,
    tol = TOLERANCIA,
    maxIter = MAX_ITERACIONES
) {

    let a = 0;
    let b = maxH;

    let fa =
        fObjetivo(a, vObjetivo, rFunc);

    let fb =
        fObjetivo(b, vObjetivo, rFunc);

    if (fa * fb > 0) {

        return crearResultado(
            "Falsa Posición",
            a,
            0,
            rFunc,
            vObjetivo,
            maxH,
            false,
            "No existe intervalo con cambio de signo"
        );
    }

    let c = a;

    for (let iter = 1; iter <= maxIter; iter++) {

        if (Math.abs(fb - fa) < 1e-12) {
            break;
        }

        c =
            b -
            (fb * (b - a)) /
            (fb - fa);

        c = Math.max(
            a,
            Math.min(b, c)
        );

        const fc =
            fObjetivo(
                c,
                vObjetivo,
                rFunc
            );

        if (Math.abs(fc) < tol) {

            return crearResultado(
                "Falsa Posición",
                c,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        if (fa * fc < 0) {

            b = c;
            fb = fc;

        } else {

            a = c;
            fa = fc;
        }
    }

    return crearResultado(
        "Falsa Posición",
        c,
        maxIter,
        rFunc,
        vObjetivo,
        maxH,
        false,
        "Máximo de iteraciones alcanzado"
    );
}


// =============================================================
// 8. PUNTO FIJO
// =============================================================

function metodoPuntoFijo(
    vObjetivo,
    rFunc,
    maxH,
    tol = TOLERANCIA,
    maxIter = MAX_ITERACIONES
) {

    let h = maxH * 0.5;

    // Estimación constante del área.
    // g(h) = h - f(h)/K
    // K actúa como una aproximación de dV/dh.

    let sumaAreas = 0;
    const muestras = 30;

    for (let i = 0; i <= muestras; i++) {

        const z =
            (i / muestras) * maxH;

        const r =
            Math.max(0, rFunc(z));

        sumaAreas +=
            PI * r * r;
    }

    let K =
        sumaAreas /
        (muestras + 1);

    if (K < 1e-8) {
        K = 1;
    }

    for (let iter = 1; iter <= maxIter; iter++) {

        const fh =
            fObjetivo(
                h,
                vObjetivo,
                rFunc
            );

        if (Math.abs(fh) < tol) {

            return crearResultado(
                "Punto Fijo",
                h,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        const hNext =
            h -
            fh / K;

        if (
            !Number.isFinite(hNext) ||
            hNext < 0 ||
            hNext > maxH
        ) {

            return crearResultado(
                "Punto Fijo",
                h,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                false,
                "El método salió del intervalo"
            );
        }

        if (Math.abs(hNext - h) < tol) {

            return crearResultado(
                "Punto Fijo",
                hNext,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        h = hNext;
    }

    return crearResultado(
        "Punto Fijo",
        h,
        maxIter,
        rFunc,
        vObjetivo,
        maxH,
        false,
        "Máximo de iteraciones alcanzado"
    );
}


// =============================================================
// 9. NEWTON-RAPHSON
// =============================================================

function metodoNewtonRaphson(
    vObjetivo,
    rFunc,
    maxH,
    tol = TOLERANCIA,
    maxIter = MAX_ITERACIONES
) {

    let h = maxH * 0.5;

    for (let iter = 1; iter <= maxIter; iter++) {

        const fh =
            fObjetivo(
                h,
                vObjetivo,
                rFunc
            );

        if (Math.abs(fh) < tol) {

            return crearResultado(
                "Newton-Raphson",
                h,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        // dV/dh = A(h) = πr²
        const r =
            Math.max(0, rFunc(h));

        const dfh =
            PI * r * r;

        if (Math.abs(dfh) < 1e-10) {

            return crearResultado(
                "Newton-Raphson",
                h,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                false,
                "Derivada demasiado pequeña"
            );
        }

        const hNext =
            h -
            fh / dfh;

        if (
            !Number.isFinite(hNext) ||
            hNext < 0 ||
            hNext > maxH
        ) {

            return crearResultado(
                "Newton-Raphson",
                h,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                false,
                "El método salió del intervalo"
            );
        }

        if (Math.abs(hNext - h) < tol) {

            return crearResultado(
                "Newton-Raphson",
                hNext,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        h = hNext;
    }

    return crearResultado(
        "Newton-Raphson",
        h,
        maxIter,
        rFunc,
        vObjetivo,
        maxH,
        false,
        "Máximo de iteraciones alcanzado"
    );
}


// =============================================================
// 10. SECANTE
// =============================================================

function metodoSecante(
    vObjetivo,
    rFunc,
    maxH,
    tol = TOLERANCIA,
    maxIter = MAX_ITERACIONES
) {

    let h0 = maxH * 0.3;
    let h1 = maxH * 0.8;

    for (let iter = 1; iter <= maxIter; iter++) {

        const f0 =
            fObjetivo(
                h0,
                vObjetivo,
                rFunc
            );

        const f1 =
            fObjetivo(
                h1,
                vObjetivo,
                rFunc
            );

        if (Math.abs(f1) < tol) {

            return crearResultado(
                "Secante",
                h1,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        if (Math.abs(f1 - f0) < 1e-12) {

            return crearResultado(
                "Secante",
                h1,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                false,
                "Denominador demasiado pequeño"
            );
        }

        const hNext =
            h1 -
            f1 *
            (h1 - h0) /
            (f1 - f0);

        if (
            !Number.isFinite(hNext) ||
            hNext < 0 ||
            hNext > maxH
        ) {

            return crearResultado(
                "Secante",
                h1,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                false,
                "El método salió del intervalo"
            );
        }

        if (Math.abs(hNext - h1) < tol) {

            return crearResultado(
                "Secante",
                hNext,
                iter,
                rFunc,
                vObjetivo,
                maxH,
                true,
                "Convergió"
            );
        }

        h0 = h1;
        h1 = hNext;
    }

    return crearResultado(
        "Secante",
        h1,
        maxIter,
        rFunc,
        vObjetivo,
        maxH,
        false,
        "Máximo de iteraciones alcanzado"
    );
}


// =============================================================
// 11. CÁMARA
// =============================================================

btnStartCamera.addEventListener(
    'click',
    async () => {

        try {

            stream =
                await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment'
                    }
                });

            video.srcObject = stream;

            video.style.display = 'block';
            canvas.style.display = 'none';

            btnCapture.disabled = false;

        } catch (error) {

            alert(
                'Error al acceder a la cámara.'
            );
        }
    }
);


// =============================================================
// 12. CAPTURA
// =============================================================

btnCapture.addEventListener(
    'click',
    () => {

        canvas.width =
            video.videoWidth || 640;

        canvas.height =
            video.videoHeight || 480;

        ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        if (stream) {

            stream
                .getTracks()
                .forEach(track => track.stop());
        }

        video.style.display = 'none';
        canvas.style.display = 'block';

        btnCapture.disabled = true;

        imageCaptured = true;

        capturedImageObj = new Image();

        capturedImageObj.src =
            canvas.toDataURL('image/png');

        calibrationPoints = [];

        actualizarEstadoPuntos();
        redrawCanvas();
    }
);


// =============================================================
// 13. SELECCIÓN DE PUNTOS
// =============================================================

canvas.addEventListener(
    'click',
    (e) => {

        if (!imageCaptured) {
            return;
        }

        if (calibrationPoints.length >= 4) {
            return;
        }

        const rect =
            canvas.getBoundingClientRect();

        const scaleX =
            canvas.width /
            rect.width;

        const scaleY =
            canvas.height /
            rect.height;

        const x =
            (e.clientX - rect.left) *
            scaleX;

        const y =
            (e.clientY - rect.top) *
            scaleY;

        calibrationPoints.push({
            x,
            y
        });

        redrawCanvas();
        actualizarEstadoPuntos();

        if (calibrationPoints.length === 4) {
            btnCalculate.disabled = false;
        }
    }
);


// =============================================================
// 14. ACTUALIZAR ESTADO
// =============================================================

function actualizarEstadoPuntos() {

    pointStatus.textContent =
        `Puntos seleccionados: ${calibrationPoints.length} / 4`;

    if (calibrationPoints.length === 4) {

        pointStatus.textContent =
            '✓ Los 4 puntos fueron seleccionados. Puede calcular.';
    }
}


// =============================================================
// 15. REDIBUJAR IMAGEN Y PUNTOS
// =============================================================

function redrawCanvas() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    if (capturedImageObj) {

        ctx.drawImage(
            capturedImageObj,
            0,
            0
        );
    }

    const labels = [
        "Tapa",
        "Base",
        "Radio Max",
        "Radio Min"
    ];

    const colors = [
        "#007bff",
        "#007bff",
        "#ff1744",
        "#ffc107"
    ];

    calibrationPoints.forEach(
        (pt, i) => {

            ctx.fillStyle =
                colors[i];

            ctx.beginPath();

            ctx.arc(
                pt.x,
                pt.y,
                7,
                0,
                2 * PI
            );

            ctx.fill();

            ctx.fillStyle =
                "white";

            ctx.font =
                "bold 13px sans-serif";

            ctx.fillText(
                labels[i],
                pt.x + 10,
                pt.y + 4
            );
        }
    );


    if (calibrationPoints.length >= 2) {

        ctx.strokeStyle =
            'rgba(0, 123, 255, 0.7)';

        ctx.lineWidth = 2;

        ctx.beginPath();

        ctx.moveTo(
            calibrationPoints[0].x,
            calibrationPoints[0].y
        );

        ctx.lineTo(
            calibrationPoints[1].x,
            calibrationPoints[1].y
        );

        ctx.stroke();
    }
}


// =============================================================
// 16. CALCULAR
// =============================================================

btnCalculate.addEventListener(
    'click',
    () => {

        if (calibrationPoints.length < 4) {
            return;
        }

        try {

            const realHeightCm =
                parseFloat(
                    realHeightInput.value
                ) || 15;

            const vObjetivo =
                parseFloat(
                    targetVolumeInput.value
                ) || 250;


            const topPt =
                calibrationPoints[0];

            const bottomPt =
                calibrationPoints[1];

            const maxRadiusPt =
                calibrationPoints[2];

            const minRadiusPt =
                calibrationPoints[3];


            // -------------------------------------------------
            // PERFIL
            // -------------------------------------------------

            const perfil =
                extraerPerfilRealDeImagen(
                    topPt,
                    bottomPt,
                    realHeightCm,
                    maxRadiusPt,
                    minRadiusPt
                );

            const rSpline =
                calcularSplineCubico(
                    perfil.rawNodes
                );


            // -------------------------------------------------
            // DATASET
            // -------------------------------------------------

            let dataset = [];

            for (
                let i = 0;
                i <= NODOS_DATASET;
                i++
            ) {

                const z =
                    i *
                    (realHeightCm / NODOS_DATASET);

                const r =
                    Math.max(
                        0,
                        rSpline(z)
                    );

                dataset.push({
                    z,
                    r
                });
            }


            // -------------------------------------------------
            // VOLUMEN TOTAL
            // -------------------------------------------------

            const volumeCm3 =
                integrarSimpson(
                    rSpline,
                    0,
                    realHeightCm,
                    80
                );


            // -------------------------------------------------
            // VALIDACIÓN DEL OBJETIVO
            // -------------------------------------------------

            let volumenObjetivoReal =
                vObjetivo;

            if (
                vObjetivo <= 0 ||
                vObjetivo > volumeCm3
            ) {

                volumenObjetivoReal =
                    volumeCm3 * 0.8;
            }


            // -------------------------------------------------
            // MÉTODOS
            // -------------------------------------------------

            const resultados = [

                metodoBiseccion(
                    volumenObjetivoReal,
                    rSpline,
                    realHeightCm
                ),

                metodoFalsaPosicion(
                    volumenObjetivoReal,
                    rSpline,
                    realHeightCm
                ),

                metodoPuntoFijo(
                    volumenObjetivoReal,
                    rSpline,
                    realHeightCm
                ),

                metodoNewtonRaphson(
                    volumenObjetivoReal,
                    rSpline,
                    realHeightCm
                ),

                metodoSecante(
                    volumenObjetivoReal,
                    rSpline,
                    realHeightCm
                )
            ];


            // -------------------------------------------------
            // RESULTADOS GENERALES
            // -------------------------------------------------

            document.getElementById(
                'volResult'
            ).textContent =
                volumeCm3.toFixed(2);

            document.getElementById(
                'targetResult'
            ).textContent =
                volumenObjetivoReal.toFixed(2);

            document.getElementById(
                'pointsCount'
            ).textContent =
                dataset.length;


            // -------------------------------------------------
            // TABLA DE MÉTODOS
            // -------------------------------------------------

            const methodsBody =
                document.querySelector(
                    '#methodsTable tbody'
                );

            methodsBody.innerHTML = '';

            resultados.forEach(
                resultado => {

                    const fila =
                        document.createElement('tr');

                    fila.innerHTML = `

                        <td>
                            <strong>
                                ${resultado.metodo}
                            </strong>
                        </td>

                        <td>
                            ${resultado.altura.toFixed(4)}
                        </td>

                        <td>
                            ${resultado.radio.toFixed(4)}
                        </td>

                        <td>
                            ${resultado.volumen.toFixed(4)}
                        </td>

                        <td>
                            ${resultado.error.toExponential(3)}
                        </td>

                        <td>
                            ${resultado.iter}
                        </td>

                        <td class="${resultado.convergio ? 'convergio' : 'no-convergio'}">
                            ${resultado.mensaje}
                        </td>
                    `;

                    methodsBody.appendChild(fila);
                }
            );


            // -------------------------------------------------
            // DATASET
            // -------------------------------------------------

            const tbody =
                document.querySelector(
                    '#datasetTable tbody'
                );

            tbody.innerHTML = '';

            dataset.forEach(
                (data, i) => {

                    tbody.innerHTML += `

                        <tr>
                            <td>${i + 1}</td>
                            <td>${data.z.toFixed(2)}</td>
                            <td>${data.r.toFixed(2)}</td>
                        </tr>

                    `;
                }
            );


            // -------------------------------------------------
            // MOSTRAR RESULTADOS
            // -------------------------------------------------

            document.getElementById(
                'resultsCard'
            ).style.display = 'block';


            // -------------------------------------------------
            // GRAFICAR
            // -------------------------------------------------

            graficarSiluetaDesdeTabla(
                dataset,
                realHeightCm,
                resultados,
                perfil
            );

        } catch (error) {

            console.error(error);

            alert(
                'Ocurrió un error durante el cálculo: ' +
                error.message
            );
        }
    }
);


// =============================================================
// 17. GRÁFICA DE LA SILUETA
// =============================================================

function graficarSiluetaDesdeTabla(
    dataset,
    realHeightCm,
    resultados,
    perfil
) {

    const graphCanvas =
        document.getElementById(
            'siluetaCanvas'
        );

    const gCtx =
        graphCanvas.getContext('2d');

    const width =
        graphCanvas.width;

    const height =
        graphCanvas.height;

    gCtx.clearRect(
        0,
        0,
        width,
        height
    );


    const padding = 35;

    const centerX =
        width / 2;

    const drawHeight =
        height - padding * 2;

    const maxR =
        Math.max(
            ...dataset.map(
                d => d.r
            )
        );

    const scaleX =
        (width / 2 - padding) /
        (maxR * 1.20);

    const scaleY =
        drawHeight /
        realHeightCm;


    // ---------------------------------------------------------
    // EJE CENTRAL
    // ---------------------------------------------------------

    gCtx.strokeStyle =
        '#555';

    gCtx.lineWidth = 1;

    gCtx.setLineDash([
        5,
        5
    ]);

    gCtx.beginPath();

    gCtx.moveTo(
        centerX,
        padding
    );

    gCtx.lineTo(
        centerX,
        height - padding
    );

    gCtx.stroke();

    gCtx.setLineDash([]);


    // ---------------------------------------------------------
    // SILUETA
    // ---------------------------------------------------------

    gCtx.beginPath();

    dataset.forEach(
        (pt, i) => {

            const x =
                centerX +
                pt.r * scaleX;

            const y =
                height -
                padding -
                pt.z * scaleY;

            if (i === 0) {
                gCtx.moveTo(x, y);
            } else {
                gCtx.lineTo(x, y);
            }
        }
    );


    for (
        let i = dataset.length - 1;
        i >= 0;
        i--
    ) {

        const pt =
            dataset[i];

        const x =
            centerX -
            pt.r * scaleX;

        const y =
            height -
            padding -
            pt.z * scaleY;

        gCtx.lineTo(
            x,
            y
        );
    }

    gCtx.closePath();


    gCtx.fillStyle =
        'rgba(0, 230, 118, 0.20)';

    gCtx.fill();

    gCtx.strokeStyle =
        '#00e676';

    gCtx.lineWidth = 2;

    gCtx.stroke();


    // ---------------------------------------------------------
    // PUNTO RADIO MÁXIMO
    // ---------------------------------------------------------

    dibujarPuntoGrafica(
        gCtx,
        centerX +
            perfil.maxRadiusCm *
            scaleX,
        height -
            padding -
            perfil.zMax *
            scaleY,
        '#ff1744',
        'Radio máximo'
    );


    // ---------------------------------------------------------
    // PUNTO RADIO MÍNIMO
    // ---------------------------------------------------------

    dibujarPuntoGrafica(
        gCtx,
        centerX +
            perfil.minRadiusCm *
            scaleX,
        height -
            padding -
            perfil.zMin *
            scaleY,
        '#ffc107',
        'Radio mínimo'
    );


    // ---------------------------------------------------------
    // PUNTOS OBTENIDOS POR LOS MÉTODOS
    // ---------------------------------------------------------

    const colores = [
        '#007bff',
        '#9c27b0',
        '#ff9800',
        '#00bcd4',
        '#e91e63'
    ];

    resultados.forEach(
        (resultado, i) => {

            const x =
                centerX +
                resultado.radio *
                scaleX;

            const y =
                height -
                padding -
                resultado.altura *
                scaleY;

            dibujarPuntoGrafica(
                gCtx,
                x,
                y,
                colores[i],
                resultado.metodo
            );
        }
    );


    // ---------------------------------------------------------
    // LEYENDA
    // ---------------------------------------------------------

    const legend =
        document.getElementById(
            'graphLegend'
        );

    legend.innerHTML = '';

    resultados.forEach(
        (resultado, i) => {

            const item =
                document.createElement('span');

            item.innerHTML = `
                <span
                    class="legend-dot"
                    style="background:${colores[i]}"
                ></span>
                ${resultado.metodo}
            `;

            legend.appendChild(item);
        }
    );

    legend.innerHTML += `
        <span>
            <span
                class="legend-dot"
                style="background:#ff1744"
            ></span>
            Radio máximo
        </span>

        <span>
            <span
                class="legend-dot"
                style="background:#ffc107"
            ></span>
            Radio mínimo
        </span>
    `;
}


// =============================================================
// 18. DIBUJAR PUNTO
// =============================================================

function dibujarPuntoGrafica(
    gCtx,
    x,
    y,
    color,
    label
) {

    gCtx.fillStyle =
        color;

    gCtx.beginPath();

    gCtx.arc(
        x,
        y,
        5,
        0,
        2 * PI
    );

    gCtx.fill();

    gCtx.strokeStyle =
        '#ffffff';

    gCtx.lineWidth = 1;

    gCtx.stroke();
}


// =============================================================
// 19. REINICIAR
// =============================================================

btnReset.addEventListener(
    'click',
    () => {

        calibrationPoints = [];

        imageCaptured = false;

        capturedImageObj = null;

        btnCalculate.disabled = true;

        pointStatus.textContent =
            'Puntos seleccionados: 0 / 4';

        document.getElementById(
            'resultsCard'
        ).style.display = 'none';

        const gCtx =
            document.getElementById(
                'siluetaCanvas'
            ).getContext('2d');

        gCtx.clearRect(
            0,
            0,
            320,
            420
        );

        redrawCanvas();
    }
);
```
