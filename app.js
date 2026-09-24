// =============================================================
// REFERENCIAS AL DOM
// =============================================================

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const btnStartCamera =
    document.getElementById('btnStartCamera');

const btnCapture =
    document.getElementById('btnCapture');

const btnReset =
    document.getElementById('btnReset');

const btnCalculate =
    document.getElementById('btnCalculate');

const realHeightInput =
    document.getElementById('realHeight');

const targetVolumeInput =
    document.getElementById('targetVolume');

const pointInstructions =
    document.getElementById('pointInstructions');


// =============================================================
// VARIABLES
// =============================================================

let stream = null;

let calibrationPoints = [];

let imageCaptured = false;

let capturedImageObj = null;


// =============================================================
// CONSTANTE PI
// =============================================================

const PI = Math.PI;


// =============================================================
// FUNCIONES MATEMÁTICAS AUXILIARES
// =============================================================

function cuadrado(valor) {
    return valor * valor;
}


function valorAbsoluto(valor) {
    return valor < 0 ? -valor : valor;
}


// =============================================================
// 1. EXTRACCIÓN DEL PERFIL DE LA BOTELLA
// =============================================================

function extraerPerfilRealDeImagen(
    topPt,
    bottomPt,
    maxRadiusPt,
    minRadiusPt,
    realHeightCm
) {

    const n = 30;

    const alturaPixel =
        valorAbsoluto(bottomPt.y - topPt.y);

    const cmPerPixel =
        realHeightCm / alturaPixel;

    const centerXPixel =
        (topPt.x + bottomPt.x) / 2;


    // Radio máximo indicado por el usuario

    const maxRadiusPx =
        valorAbsoluto(
            maxRadiusPt.x - centerXPixel
        );


    // Radio mínimo indicado por el usuario

    const minRadiusPx =
        valorAbsoluto(
            minRadiusPt.x - centerXPixel
        );


    const maxRadiusCm =
        maxRadiusPx * cmPerPixel;


    const minRadiusCm =
        minRadiusPx * cmPerPixel;


    let rawNodes = [];


    for (let i = 0; i <= n; i++) {

        // Altura en centímetros

        const z =
            i * (realHeightCm / n);


        // Posición vertical en la fotografía

        const porcentaje =
            i / n;

        const currentY =
            bottomPt.y -
            porcentaje *
            (bottomPt.y - topPt.y);


        let detectedRadiusPx =
            maxRadiusPx;


        // -----------------------------------------------------
        // Buscar borde derecho
        // -----------------------------------------------------

        const searchWidth =
            Math.max(
                10,
                Math.floor(maxRadiusPx * 1.4)
            );


        try {

            const startX =
                Math.max(
                    0,
                    Math.floor(centerXPixel)
                );


            const imgData =
                ctx.getImageData(
                    startX,
                    Math.floor(currentY),
                    Math.min(
                        searchWidth,
                        canvas.width - startX
                    ),
                    1
                ).data;


            let maxGradient = 0;

            let bestOffset =
                detectedRadiusPx;


            for (
                let px = 4;
                px < imgData.length - 8;
                px += 4
            ) {

                const b1 =
                    (
                        imgData[px] +
                        imgData[px + 1] +
                        imgData[px + 2]
                    ) / 3;


                const b2 =
                    (
                        imgData[px + 4] +
                        imgData[px + 5] +
                        imgData[px + 6]
                    ) / 3;


                const gradient =
                    valorAbsoluto(
                        b2 - b1
                    );


                if (gradient > maxGradient) {

                    maxGradient =
                        gradient;

                    bestOffset =
                        px / 4;

                }

            }


            if (maxGradient > 10) {

                detectedRadiusPx =
                    bestOffset;

            }

        } catch (error) {

            detectedRadiusPx =
                maxRadiusPx;

        }


        // -----------------------------------------------------
        // Limitaciones utilizando los puntos de calibración
        // -----------------------------------------------------

        if (detectedRadiusPx > maxRadiusPx) {

            detectedRadiusPx =
                maxRadiusPx;

        }


        if (detectedRadiusPx < minRadiusPx) {

            detectedRadiusPx =
                minRadiusPx;

        }


        const radiusCm =
            detectedRadiusPx *
            cmPerPixel;


        rawNodes.push({

            z: z,

            r: radiusCm

        });

    }


    return {

        rawNodes,

        maxRadiusCm,

        minRadiusCm

    };

}


// =============================================================
// 2. SPLINE CÚBICO
// =============================================================

function calcularSplineCubico(nodes) {

    const n =
        nodes.length - 1;


    const a =
        nodes.map(
            punto => punto.r
        );


    const h = [];

    for (
        let i = 0;
        i < n;
        i++
    ) {

        h[i] =
            nodes[i + 1].z -
            nodes[i].z;

    }


    const alpha =
        new Array(n + 1).fill(0);


    for (
        let i = 1;
        i < n;
        i++
    ) {

        alpha[i] =
            (3 / h[i]) *
            (a[i + 1] - a[i]) -
            (3 / h[i - 1]) *
            (a[i] - a[i - 1]);

    }


    const l =
        new Array(n + 1).fill(0);

    const mu =
        new Array(n + 1).fill(0);

    const z =
        new Array(n + 1).fill(0);


    l[0] = 1;


    for (
        let i = 1;
        i < n;
        i++
    ) {

        l[i] =
            2 *
            (
                nodes[i + 1].z -
                nodes[i - 1].z
            ) -
            h[i - 1] *
            mu[i - 1];


        mu[i] =
            h[i] /
            l[i];


        z[i] =
            (
                alpha[i] -
                h[i - 1] *
                z[i - 1]
            ) /
            l[i];

    }


    l[n] = 1;


    const c =
        new Array(n + 1).fill(0);

    const b =
        new Array(n).fill(0);

    const d =
        new Array(n).fill(0);


    for (
        let j = n - 1;
        j >= 0;
        j--
    ) {

        c[j] =
            z[j] -
            mu[j] *
            c[j + 1];


        b[j] =
            (
                a[j + 1] -
                a[j]
            ) /
            h[j] -
            h[j] *
            (
                c[j + 1] +
                2 * c[j]
            ) /
            3;


        d[j] =
            (
                c[j + 1] -
                c[j]
            ) /
            (3 * h[j]);

    }


    return function(zEval) {

        if (
            zEval <=
            nodes[0].z
        ) {

            return nodes[0].r;

        }


        if (
            zEval >=
            nodes[n].z
        ) {

            return nodes[n].r;

        }


        let i = 0;


        for (
            let j = 0;
            j < n;
            j++
        ) {

            if (
                zEval >= nodes[j].z &&
                zEval <= nodes[j + 1].z
            ) {

                i = j;

                break;

            }

        }


        const dx =
            zEval -
            nodes[i].z;


        return (
            a[i] +
            b[i] * dx +
            c[i] * cuadrado(dx) +
            d[i] * dx * dx * dx
        );

    };

}


// =============================================================
// 3. INTEGRACIÓN DE SIMPSON 1/3
// =============================================================

function integrarSimpson(
    rFunc,
    zMin,
    zMax,
    numIntervalos = 80
) {

    if (
        zMin >= zMax
    ) {

        return 0;

    }


    if (
        numIntervalos % 2 !== 0
    ) {

        numIntervalos++;

    }


    const h =
        (zMax - zMin) /
        numIntervalos;


    let suma =
        cuadrado(
            rFunc(zMin)
        ) +
        cuadrado(
            rFunc(zMax)
        );


    for (
        let i = 1;
        i < numIntervalos;
        i++
    ) {

        const z =
            zMin +
            i * h;


        const radio =
            rFunc(z);


        const factor =
            i % 2 === 0
                ? 2
                : 4;


        suma +=
            factor *
            cuadrado(radio);

    }


    return (
        PI *
        h /
        3 *
        suma
    );

}


// =============================================================
// FUNCIÓN OBJETIVO
// =============================================================

function fObjetivo(
    h,
    volumenObjetivo,
    rFunc
) {

    return (
        integrarSimpson(
            rFunc,
            0,
            h
        ) -
        volumenObjetivo
    );

}


// =============================================================
// FUNCIÓN PARA CALCULAR EL ERROR
// =============================================================

function calcularResiduo(
    altura,
    volumenObjetivo,
    rFunc
) {

    return valorAbsoluto(
        fObjetivo(
            altura,
            volumenObjetivo,
            rFunc
        )
    );

}


// =============================================================
// 4. MÉTODO DE BISECCIÓN
// =============================================================

function metodoBiseccion(
    volumenObjetivo,
    rFunc,
    maxH,
    tol = 0.0001,
    maxIter = 100
) {

    let a = 0;

    let b = maxH;

    let fa =
        fObjetivo(
            a,
            volumenObjetivo,
            rFunc
        );

    let fb =
        fObjetivo(
            b,
            volumenObjetivo,
            rFunc
        );


    if (
        fa * fb > 0
    ) {

        return {
            altura: NaN,
            iter: 0,
            error: NaN
        };

    }


    let c = a;

    let iter = 0;


    while (
        iter < maxIter
    ) {

        c =
            (a + b) / 2;


        const fc =
            fObjetivo(
                c,
                volumenObjetivo,
                rFunc
            );


        if (
            valorAbsoluto(fc) <
            tol ||
            valorAbsoluto(b - a) / 2 <
            tol
        ) {

            break;

        }


        if (
            fa * fc < 0
        ) {

            b = c;

            fb = fc;

        } else {

            a = c;

            fa = fc;

        }


        iter++;

    }


    return {

        altura: c,

        iter: iter,

        error:
            valorAbsoluto(
                fObjetivo(
                    c,
                    volumenObjetivo,
                    rFunc
                )
            )

    };

}


// =============================================================
// 5. FALSA POSICIÓN
// =============================================================

function metodoFalsaPosicion(
    volumenObjetivo,
    rFunc,
    maxH,
    tol = 0.0001,
    maxIter = 100
) {

    let a = 0;

    let b = maxH;


    let fa =
        fObjetivo(
            a,
            volumenObjetivo,
            rFunc
        );


    let fb =
        fObjetivo(
            b,
            volumenObjetivo,
            rFunc
        );


    if (
        fa * fb > 0
    ) {

        return {
            altura: NaN,
            iter: 0,
            error: NaN
        };

    }


    let c = a;


    for (
        let iter = 0;
        iter < maxIter;
        iter++
    ) {

        c =
            b -
            (
                fb *
                (b - a)
            ) /
            (fb - fa);


        const fc =
            fObjetivo(
                c,
                volumenObjetivo,
                rFunc
            );


        if (
            valorAbsoluto(fc) <
            tol
        ) {

            return {

                altura: c,

                iter: iter + 1,

                error:
                    valorAbsoluto(fc)

            };

        }


        if (
            fa * fc < 0
        ) {

            b = c;

            fb = fc;

        } else {

            a = c;

            fa = fc;

        }

    }


    return {

        altura: c,

        iter: maxIter,

        error:
            calcularResiduo(
                c,
                volumenObjetivo,
                rFunc
            )

    };

}


// =============================================================
// 6. PUNTO FIJO
// =============================================================

function metodoPuntoFijo(
    volumenObjetivo,
    rFunc,
    maxH,
    tol = 0.0001,
    maxIter = 100
) {

    let h =
        maxH * 0.5;


    for (
        let iter = 0;
        iter < maxIter;
        iter++
    ) {

        const fh =
            fObjetivo(
                h,
                volumenObjetivo,
                rFunc
            );


        if (
            valorAbsoluto(fh) <
            tol
        ) {

            return {

                altura: h,

                iter: iter,

                error:
                    valorAbsoluto(fh)

            };

        }


        /*
         * Aproximamos dV/dh mediante
         * el área transversal actual.
         */

        const radio =
            Math.max(
                rFunc(h),
                0.000001
            );


        const derivada =
            PI *
            cuadrado(radio);


        /*
         * Función de iteración:
         *
         * g(h) = h - f(h)/f'(h)
         *
         * Se utiliza para obtener una
         * iteración de punto fijo estable.
         */

        let hNext =
            h -
            fh /
            derivada;


        /*
         * Mantener la altura dentro
         * de los límites físicos.
         */

        hNext =
            Math.max(
                0,
                Math.min(
                    maxH,
                    hNext
                )
            );


        if (
            valorAbsoluto(
                hNext - h
            ) <
            tol
        ) {

            h = hNext;

            return {

                altura: h,

                iter: iter + 1,

                error:
                    calcularResiduo(
                        h,
                        volumenObjetivo,
                        rFunc
                    )

            };

        }


        h =
            hNext;

    }


    return {

        altura: h,

        iter: maxIter,

        error:
            calcularResiduo(
                h,
                volumenObjetivo,
                rFunc
            )

    };

}


// =============================================================
// 7. NEWTON-RAPHSON
// =============================================================

function metodoNewtonRaphson(
    volumenObjetivo,
    rFunc,
    maxH,
    tol = 0.0001,
    maxIter = 100
) {

    let h =
        maxH * 0.5;


    for (
        let iter = 0;
        iter < maxIter;
        iter++
    ) {

        const fh =
            fObjetivo(
                h,
                volumenObjetivo,
                rFunc
            );


        if (
            valorAbsoluto(fh) <
            tol
        ) {

            return {

                altura: h,

                iter: iter,

                error:
                    valorAbsoluto(fh)

            };

        }


        /*
         * Derivada:
         *
         * F'(h) = π r(h)²
         */

        const radio =
            rFunc(h);


        const derivada =
            PI *
            cuadrado(radio);


        if (
            valorAbsoluto(derivada) <
            1e-10
        ) {

            break;

        }


        let hNext =
            h -
            fh /
            derivada;


        hNext =
            Math.max(
                0,
                Math.min(
                    maxH,
                    hNext
                )
            );


        if (
            valorAbsoluto(
                hNext - h
            ) <
            tol
        ) {

            h =
                hNext;

            break;

        }


        h =
            hNext;

    }


    return {

        altura: h,

        iter: maxIter,

        error:
            calcularResiduo(
                h,
                volumenObjetivo,
                rFunc
            )

    };

}


// =============================================================
// 8. MÉTODO DE LA SECANTE
// =============================================================

function metodoSecante(
    volumenObjetivo,
    rFunc,
    maxH,
    tol = 0.0001,
    maxIter = 100
) {

    let h0 =
        maxH * 0.3;


    let h1 =
        maxH * 0.8;


    let f0 =
        fObjetivo(
            h0,
            volumenObjetivo,
            rFunc
        );


    let f1 =
        fObjetivo(
            h1,
            volumenObjetivo,
            rFunc
        );


    let hNext =
        h1;


    for (
        let iter = 0;
        iter < maxIter;
        iter++
    ) {

        if (
            valorAbsoluto(
                f1 - f0
            ) <
            1e-10
        ) {

            break;

        }


        hNext =
            h1 -
            (
                f1 *
                (h1 - h0)
            ) /
            (f1 - f0);


        hNext =
            Math.max(
                0,
                Math.min(
                    maxH,
                    hNext
                )
            );


        const fNext =
            fObjetivo(
                hNext,
                volumenObjetivo,
                rFunc
            );


        if (
            valorAbsoluto(fNext) <
            tol
        ) {

            return {

                altura: hNext,

                iter: iter + 1,

                error:
                    valorAbsoluto(fNext)

            };

        }


        h0 = h1;

        f0 = f1;


        h1 = hNext;

        f1 = fNext;

    }


    return {

        altura: hNext,

        iter: maxIter,

        error:
            calcularResiduo(
                hNext,
                volumenObjetivo,
                rFunc
            )

    };

}


// =============================================================
// 9. CÁMARA
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


            video.srcObject =
                stream;


            video.style.display =
                'block';


            canvas.style.display =
                'none';


            btnCapture.disabled =
                false;


            pointInstructions.textContent =
                'Cámara activa. Coloca la botella en posición vertical y captura la fotografía.';

        } catch (err) {

            alert(
                'Error al acceder a la cámara.'
            );

            console.error(err);

        }

    }
);


// =============================================================
// 10. CAPTURA DE FOTO
// =============================================================

btnCapture.addEventListener(
    'click',
    () => {

        canvas.width =
            video.videoWidth ||
            640;


        canvas.height =
            video.videoHeight ||
            480;


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
                .forEach(
                    track => track.stop()
                );

        }


        video.style.display =
            'none';


        canvas.style.display =
            'block';


        btnCapture.disabled =
            true;


        imageCaptured =
            true;


        capturedImageObj =
            new Image();


        capturedImageObj.src =
            canvas.toDataURL(
                'image/png'
            );


        pointInstructions.innerHTML =
            '<b>Punto 1:</b> selecciona la Tapa de la botella.';

    }
);


// =============================================================
// 11. SELECCIÓN DE LOS 4 PUNTOS
// =============================================================

canvas.addEventListener(
    'click',
    (e) => {

        if (!imageCaptured) {

            return;

        }


        if (
            calibrationPoints.length >= 4
        ) {

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
            (
                e.clientX -
                rect.left
            ) *
            scaleX;


        const y =
            (
                e.clientY -
                rect.top
            ) *
            scaleY;


        calibrationPoints.push({
            x: x,
            y: y
        });


        redrawCanvas();


        const cantidad =
            calibrationPoints.length;


        if (cantidad === 1) {

            pointInstructions.innerHTML =
                '<b>Punto 2:</b> selecciona la Base de la botella.';

        }


        else if (cantidad === 2) {

            pointInstructions.innerHTML =
                '<b>Punto 3:</b> selecciona el Borde Máximo.';

        }


        else if (cantidad === 3) {

            pointInstructions.innerHTML =
                '<b>Punto 4:</b> selecciona el Borde Mínimo.';

        }


        else if (cantidad === 4) {

            pointInstructions.innerHTML =
                '<b>Los 4 puntos fueron seleccionados.</b> Presiona "Calcular Volumen".';

            btnCalculate.disabled =
                false;

        }

    }
);


// =============================================================
// 12. DIBUJAR PUNTOS
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

        'Tapa',

        'Base',

        'Borde Max',

        'Borde Min'

    ];


    const colors = [

        '#007bff',

        '#007bff',

        '#ff1744',

        '#ffc107'

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
                'white';


            ctx.font =
                'bold 13px sans-serif';


            ctx.fillText(
                labels[i],
                pt.x + 10,
                pt.y + 4
            );

        }
    );


    if (
        calibrationPoints.length >= 2
    ) {

        ctx.strokeStyle =
            'rgba(0, 123, 255, 0.7)';


        ctx.lineWidth =
            2;


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
// 13. BOTÓN REINICIAR
// =============================================================

btnReset.addEventListener(
    'click',
    () => {

        calibrationPoints = [];

        imageCaptured = false;

        btnCalculate.disabled =
            true;


        document.getElementById(
            'resultsCard'
        ).style.display =
            'none';


        const siluetaCanvas =
            document.getElementById(
                'siluetaCanvas'
            );


        if (siluetaCanvas) {

            const gCtx =
                siluetaCanvas.getContext(
                    '2d'
                );


            gCtx.clearRect(
                0,
                0,
                siluetaCanvas.width,
                siluetaCanvas.height
            );

        }


        pointInstructions.innerHTML =
            'Primero inicia la cámara y captura una fotografía. Después selecciona los 4 puntos: <b>Tapa → Base → Borde máximo → Borde mínimo</b>.';


        redrawCanvas();

    }
);


// =============================================================
// 14. CÁLCULO PRINCIPAL
// =============================================================

btnCalculate.addEventListener(
    'click',
    () => {

        if (
            calibrationPoints.length < 4
        ) {

            return;

        }


        const realHeightCm =
            parseFloat(
                realHeightInput.value
            ) || 21;


        const volumenObjetivo =
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


        // -----------------------------------------------------
        // EXTRAER PERFIL
        // -----------------------------------------------------

        const perfil =
            extraerPerfilRealDeImagen(
                topPt,
                bottomPt,
                maxRadiusPt,
                minRadiusPt,
                realHeightCm
            );


        const rawNodes =
            perfil.rawNodes;


        const maxRadiusCm =
            perfil.maxRadiusCm;


        const minRadiusCm =
            perfil.minRadiusCm;


        // -----------------------------------------------------
        // SPLINE
        // -----------------------------------------------------

        const rSpline =
            calcularSplineCubico(
                rawNodes
            );


        // -----------------------------------------------------
        // DATASET FINAL
        // -----------------------------------------------------

        const totalPuntos =
            60;


        const dataset = [];


        for (
            let i = 0;
            i <= totalPuntos;
            i++
        ) {

            const z =
                i *
                (
                    realHeightCm /
                    totalPuntos
                );


            let r =
                rSpline(z);


            r =
                Math.max(
                    minRadiusCm,
                    Math.min(
                        maxRadiusCm,
                        r
                    )
                );


            dataset.push({

                z: z,

                r: r

            });

        }


        // -----------------------------------------------------
        // VOLUMEN TOTAL
        // -----------------------------------------------------

        const volumeCm3 =
            integrarSimpson(
                rSpline,
                0,
                realHeightCm,
                80
            );


        // -----------------------------------------------------
        // VALIDAR VOLUMEN OBJETIVO
        // -----------------------------------------------------

        let vObjetivo =
            volumenObjetivo;


        if (
            vObjetivo >= volumeCm3
        ) {

            vObjetivo =
                volumeCm3 * 0.95;

        }


        // -----------------------------------------------------
        // EJECUTAR LOS 5 MÉTODOS
        // -----------------------------------------------------

        const resBiseccion =
            metodoBiseccion(
                vObjetivo,
                rSpline,
                realHeightCm
            );


        const resFalsaPosicion =
            metodoFalsaPosicion(
                vObjetivo,
                rSpline,
                realHeightCm
            );


        const resPuntoFijo =
            metodoPuntoFijo(
                vObjetivo,
                rSpline,
                realHeightCm
            );


        const resNewton =
            metodoNewtonRaphson(
                vObjetivo,
                rSpline,
                realHeightCm
            );


        const resSecante =
            metodoSecante(
                vObjetivo,
                rSpline,
                realHeightCm
            );


        const resultados = [

            {
                nombre: 'Bisección',
                resultado: resBiseccion
            },

            {
                nombre: 'Falsa Posición',
                resultado: resFalsaPosicion
            },

            {
                nombre: 'Punto Fijo',
                resultado: resPuntoFijo
            },

            {
                nombre: 'Newton-Raphson',
                resultado: resNewton
            },

            {
                nombre: 'Secante',
                resultado: resSecante
            }

        ];


        // -----------------------------------------------------
        // MOSTRAR RESUMEN
        // -----------------------------------------------------

        document.getElementById(
            'volResult'
        ).textContent =
            volumeCm3.toFixed(2);


        document.getElementById(
            'targetResult'
        ).textContent =
            vObjetivo.toFixed(2);


        document.getElementById(
            'pointsCount'
        ).textContent =
            dataset.length;


        document.getElementById(
            'maxRadiusResult'
        ).textContent =
            maxRadiusCm.toFixed(2);


        document.getElementById(
            'minRadiusResult'
        ).textContent =
            minRadiusCm.toFixed(2);


        // -----------------------------------------------------
        // TABLA DE MÉTODOS
        // -----------------------------------------------------

        const methodsBody =
            document.querySelector(
                '#methodsTable tbody'
            );


        methodsBody.innerHTML = '';


        resultados.forEach(
            metodo => {

                const resultado =
                    metodo.resultado;


                const fila =
                    document.createElement(
                        'tr'
                    );


                const altura =
                    Number.isFinite(
                        resultado.altura
                    )
                        ? resultado.altura.toFixed(4)
                        : 'No converge';


                const error =
                    Number.isFinite(
                        resultado.error
                    )
                        ? resultado.error.toFixed(6)
                        : '-';


                fila.innerHTML = `

                    <td>
                        ${metodo.nombre}
                    </td>

                    <td>
                        ${altura}
                    </td>

                    <td>
                        ${resultado.iter}
                    </td>

                    <td>
                        ${error}
                    </td>

                `;


                methodsBody.appendChild(
                    fila
                );

            }
        );


        // -----------------------------------------------------
        // TABLA DEL DATASET
        // -----------------------------------------------------

        const tbody =
            document.querySelector(
                '#datasetTable tbody'
            );


        tbody.innerHTML = '';


        dataset.forEach(
            (data, i) => {

                const fila =
                    document.createElement(
                        'tr'
                    );


                fila.innerHTML = `

                    <td>
                        ${i + 1}
                    </td>

                    <td>
                        ${data.z.toFixed(2)}
                    </td>

                    <td>
                        ${data.r.toFixed(2)}
                    </td>

                `;


                tbody.appendChild(
                    fila
                );

            }
        );


        // -----------------------------------------------------
        // MOSTRAR RESULTADOS
        // -----------------------------------------------------

        document.getElementById(
            'resultsCard'
        ).style.display =
            'block';


        // -----------------------------------------------------
        // GRAFICAR SILUETA
        // -----------------------------------------------------

        graficarSilueta(
            dataset,
            realHeightCm,
            resultados,
            vObjetivo,
            rSpline
        );

    }
);


// =============================================================
// 15. GRÁFICA DE LA SILUETA
// =============================================================

function graficarSilueta(
    dataset,
    realHeightCm,
    resultados,
    volumenObjetivo,
    rSpline
) {

    const graphCanvas =
        document.getElementById(
            'siluetaCanvas'
        );


    const gCtx =
        graphCanvas.getContext(
            '2d'
        );


    gCtx.clearRect(
        0,
        0,
        graphCanvas.width,
        graphCanvas.height
    );


    const padding =
        35;


    const centerX =
        graphCanvas.width / 2;


    const drawHeight =
        graphCanvas.height -
        padding * 2;


    const maxRadius =
        Math.max(
            ...dataset.map(
                punto => punto.r
            )
        );


    const scaleX =
        (
            graphCanvas.width /
            2 -
            padding
        ) /
        (
            maxRadius *
            1.2
        );


    const scaleY =
        drawHeight /
        realHeightCm;


    // ---------------------------------------------------------
    // EJE CENTRAL
    // ---------------------------------------------------------

    gCtx.strokeStyle =
        '#555';


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
        graphCanvas.height -
        padding
    );


    gCtx.stroke();


    gCtx.setLineDash([]);


    // ---------------------------------------------------------
    // SILUETA DERECHA
    // ---------------------------------------------------------

    gCtx.beginPath();


    dataset.forEach(
        (pt, i) => {

            const x =
                centerX +
                pt.r *
                scaleX;


            const y =
                graphCanvas.height -
                padding -
                pt.z *
                scaleY;


            if (i === 0) {

                gCtx.moveTo(
                    x,
                    y
                );

            } else {

                gCtx.lineTo(
                    x,
                    y
                );

            }

        }
    );


    // ---------------------------------------------------------
    // SILUETA IZQUIERDA
    // ---------------------------------------------------------

    for (
        let i =
            dataset.length - 1;
        i >= 0;
        i--
    ) {

        const pt =
            dataset[i];


        const x =
            centerX -
            pt.r *
            scaleX;


        const y =
            graphCanvas.height -
            padding -
            pt.z *
            scaleY;


        gCtx.lineTo(
            x,
            y
        );

    }


    gCtx.closePath();


    // Relleno

    gCtx.fillStyle =
        'rgba(0, 230, 118, 0.2)';


    gCtx.fill();


    // Borde

    gCtx.strokeStyle =
        '#00e676';


    gCtx.lineWidth =
        2;


    gCtx.stroke();


    // ---------------------------------------------------------
    // MARCAR ALTURAS DE LOS MÉTODOS
    // ---------------------------------------------------------

    resultados.forEach(
        metodo => {

            const altura =
                metodo.resultado.altura;


            if (
                !Number.isFinite(
                    altura
                )
            ) {

                return;

            }


            if (
                altura < 0 ||
                altura > realHeightCm
            ) {

                return;

            }


            const y =
                graphCanvas.height -
                padding -
                altura *
                scaleY;


            gCtx.strokeStyle =
                '#ffffff';


            gCtx.lineWidth =
                1;


            gCtx.setLineDash([
                3,
                3
            ]);


            gCtx.beginPath();


            gCtx.moveTo(
                centerX -
                maxRadius *
                scaleX,
                y
            );


            gCtx.lineTo(
                centerX +
                maxRadius *
                scaleX,
                y
            );


            gCtx.stroke();


            gCtx.setLineDash([]);


            gCtx.fillStyle =
                '#ffffff';


            gCtx.font =
                '11px Arial';


            gCtx.fillText(
                metodo.nombre,
                5,
                y - 3
            );

        }
    );


    // ---------------------------------------------------------
    // TEXTO DE EJES
    // ---------------------------------------------------------

    gCtx.fillStyle =
        '#ffffff';


    gCtx.font =
        '12px Arial';


    gCtx.fillText(
        'Altura (cm)',
        5,
        15
    );


    gCtx.fillText(
        '0',
        centerX + 5,
        graphCanvas.height - padding + 15
    );


    gCtx.fillText(
        realHeightCm.toFixed(1),
        centerX + 5,
        padding
    );

}
