const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const profileCanvas =
document.getElementById('profileCanvas');

const profileCtx =
profileCanvas.getContext('2d');

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

const cameraStatus =
document.getElementById('cameraStatus');

const pointInstructions =
document.getElementById('pointInstructions');

let stream = null;

let calibrationPoints = [];

let imageCaptured = false;

let capturedImageObj = null;

const PI_MANUAL =
3.141592653589793;

/* ============================================================
FUNCIONES MATEMÁTICAS
============================================================ */

function elevarAlCuadrado(base) {

```
return base * base;
```

}

function valorAbsoluto(numero) {

```
return numero < 0
    ? -numero
    : numero;
```

}

/* ============================================================
INFORMACIÓN DE PUNTOS
============================================================ */

const pointLabels = [
'Tapa',
'Base',
'Borde Max',
'Borde Min'
];

const pointColors = [
'#007bff',
'#007bff',
'#ff1744',
'#ffc107'
];

/* ============================================================
CÁMARA
============================================================ */

btnStartCamera.addEventListener(
'click',
async () => {

```
    cameraStatus.textContent =
        'Solicitando acceso a la cámara...';

    cameraStatus.className =
        'camera-status';


    /*
     * Comprobar compatibilidad.
     */

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        cameraStatus.textContent =
            'Este navegador no permite acceder a la cámara mediante esta página.';

        cameraStatus.className =
            'camera-status error';

        return;
    }


    /*
     * GitHub Pages debe ejecutarse mediante HTTPS.
     */

    if (
        location.protocol !== 'https:' &&
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1'
    ) {

        cameraStatus.textContent =
            'La página debe ejecutarse mediante HTTPS.';

        cameraStatus.className =
            'camera-status error';

        return;
    }


    try {

        /*
         * Si existe una cámara anterior,
         * detenerla.
         */

        if (stream) {

            stream.getTracks().forEach(
                track => track.stop()
            );

            stream = null;
        }


        /*
         * Primero solicitamos cualquier cámara.
         *
         * Esto es más compatible con celulares
         * que solicitar directamente environment.
         */

        stream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });


        /*
         * Asignar la cámara al elemento VIDEO.
         */

        video.srcObject =
            stream;


        video.style.display =
            'block';

        canvas.style.display =
            'none';


        /*
         * Esperar a que el navegador
         * cargue el vídeo.
         */

        await new Promise(
            resolve => {

                if (
                    video.readyState >= 2
                ) {

                    resolve();

                } else {

                    video.onloadedmetadata =
                        () => resolve();

                }

            }
        );


        await video.play();


        /*
         * Intentar seleccionar la cámara trasera.
         */

        const track =
            stream.getVideoTracks()[0];


        if (track) {

            try {

                await track.applyConstraints({

                    facingMode: {
                        ideal: 'environment'
                    }

                });

            } catch (error) {

                console.log(
                    'No se pudo seleccionar automáticamente la cámara trasera:',
                    error
                );

            }

        }


        btnCapture.disabled =
            false;


        cameraStatus.textContent =
            'Cámara activa. Ahora puedes capturar la fotografía.';

        cameraStatus.className =
            'camera-status success-status';


    } catch (error) {

        console.error(
            'Error al iniciar la cámara:',
            error
        );


        let mensaje =
            'No se pudo acceder a la cámara. ';


        switch (error.name) {

            case 'NotAllowedError':

                mensaje +=
                    'El permiso de cámara fue rechazado. Revisa los permisos del navegador.';

                break;


            case 'NotFoundError':

                mensaje +=
                    'El celular no encontró ninguna cámara.';

                break;


            case 'NotReadableError':

                mensaje +=
                    'La cámara está siendo utilizada por otra aplicación.';

                break;


            case 'OverconstrainedError':

                mensaje +=
                    'La configuración solicitada para la cámara no es compatible.';

                break;


            case 'SecurityError':

                mensaje +=
                    'El navegador bloqueó el acceso a la cámara por seguridad.';

                break;


            case 'AbortError':

                mensaje +=
                    'El acceso a la cámara fue interrumpido.';

                break;


            default:

                mensaje +=
                    error.message ||
                    'Error desconocido.';

                break;
        }


        cameraStatus.textContent =
            mensaje;

        cameraStatus.className =
            'camera-status error';

    }

}
```

);


/* ============================================================
CAPTURA DE IMAGEN
============================================================ */

btnCapture.addEventListener(
'click',
() => {

```
    if (
        !stream ||
        video.readyState < 2
    ) {

        alert(
            'La cámara todavía no está lista.'
        );

        return;
    }


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


    /*
     * Detener cámara.
     */

    if (stream) {

        stream.getTracks().forEach(
            track => track.stop()
        );

        stream = null;
    }


    video.srcObject = null;


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


    capturedImageObj.onload =
        () => {

            redrawCanvas();

        };


    capturedImageObj.src =
        canvas.toDataURL(
            'image/png'
        );


    cameraStatus.textContent =
        'Fotografía capturada. Selecciona los 4 puntos.';

    cameraStatus.className =
        'camera-status success-status';


    actualizarInstrucciones();

}
```

);

/* ============================================================
AJUSTE AUTOMÁTICO AL BORDE
============================================================ */

function snapToRealEdge(
xClick,
yClick
) {

```
const searchRange = 12;

let startX =
    Math.max(
        0,
        Math.floor(
            xClick - searchRange
        )
    );

let width =
    searchRange * 2;


let imgData;


try {

    imgData =
        ctx.getImageData(
            startX,
            Math.floor(yClick),
            width,
            1
        ).data;

} catch (e) {

    return xClick;
}


let maxGradient = 0;

let bestX = xClick;


for (
    let i = 0;
    i < imgData.length - 8;
    i += 4
) {

    const brightnessCurrent =
        (
            imgData[i] +
            imgData[i + 1] +
            imgData[i + 2]
        ) / 3;


    const brightnessNext =
        (
            imgData[i + 4] +
            imgData[i + 5] +
            imgData[i + 6]
        ) / 3;


    const gradient =
        valorAbsoluto(
            brightnessNext -
            brightnessCurrent
        );


    if (
        gradient > maxGradient
    ) {

        maxGradient =
            gradient;


        const offset =
            (i / 4) -
            searchRange;


        bestX =
            xClick +
            offset;
    }
}


return maxGradient > 15
    ? bestX
    : xClick;
```

}

/* ============================================================
CLICS SOBRE LA IMAGEN
============================================================ */

canvas.addEventListener(
'click',
(e) => {

```
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


    let x =
        (e.clientX -
         rect.left) *
        scaleX;


    let y =
        (e.clientY -
         rect.top) *
        scaleY;


    /*
     * El tercer y cuarto punto
     * se ajustan al borde.
     */

    if (
        calibrationPoints.length === 2 ||
        calibrationPoints.length === 3
    ) {

        x =
            snapToRealEdge(
                x,
                y
            );
    }


    calibrationPoints.push({
        x: x,
        y: y
    });


    redrawCanvas();


    actualizarInstrucciones();


    if (
        calibrationPoints.length === 4
    ) {

        btnCalculate.disabled =
            false;

        pointInstructions.textContent =
            'Los 4 puntos fueron seleccionados. Ya puedes calcular.';

    }

}
```

);

/* ============================================================
INSTRUCCIONES
============================================================ */

function actualizarInstrucciones() {

```
if (!imageCaptured) {

    pointInstructions.textContent =
        'Primero inicia la cámara y captura una fotografía.';

    return;
}


const cantidad =
    calibrationPoints.length;


if (cantidad === 0) {

    pointInstructions.textContent =
        '1. Selecciona la Tapa de la botella.';

} else if (cantidad === 1) {

    pointInstructions.textContent =
        '2. Selecciona la Base de la botella.';

} else if (cantidad === 2) {

    pointInstructions.textContent =
        '3. Selecciona el Borde Máximo.';

} else if (cantidad === 3) {

    pointInstructions.textContent =
        '4. Selecciona el Borde Mínimo.';

} else {

    pointInstructions.textContent =
        'Los 4 puntos fueron seleccionados.';
}
```

}

/* ============================================================
REDIBUJAR IMAGEN Y PUNTOS
============================================================ */

function redrawCanvas() {

```
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
        0,
        canvas.width,
        canvas.height
    );

}


for (
    let i = 0;
    i < calibrationPoints.length;
    i++
) {

    const point =
        calibrationPoints[i];


    ctx.fillStyle =
        pointColors[i];


    ctx.beginPath();


    ctx.arc(
        point.x,
        point.y,
        8,
        0,
        2 * PI_MANUAL
    );


    ctx.fill();


    ctx.strokeStyle =
        'white';

    ctx.lineWidth =
        2;

    ctx.stroke();


    ctx.fillStyle =
        'white';

    ctx.font =
        'bold 14px Arial';


    ctx.fillText(
        pointLabels[i],
        point.x + 12,
        point.y + 5
    );

}


/*
 * Línea de referencia vertical.
 */

if (
    calibrationPoints.length >= 2
) {

    const top =
        calibrationPoints[0];

    const bottom =
        calibrationPoints[1];


    ctx.strokeStyle =
        'rgba(0, 123, 255, 0.8)';

    ctx.lineWidth = 2;


    ctx.beginPath();

    ctx.moveTo(
        top.x,
        top.y
    );

    ctx.lineTo(
        bottom.x,
        bottom.y
    );

    ctx.stroke();
}
```

}

/* ============================================================
OBTENER INFORMACIÓN GEOMÉTRICA
============================================================ */

function obtenerGeometria() {

```
const top =
    calibrationPoints[0];

const bottom =
    calibrationPoints[1];

const maxPoint =
    calibrationPoints[2];

const minPoint =
    calibrationPoints[3];


const pixelHeight =
    valorAbsoluto(
        bottom.y -
        top.y
    );


if (pixelHeight <= 0) {

    throw new Error(
        'La altura de la botella no es válida.'
    );
}


const realHeight =
    parseFloat(
        realHeightInput.value
    ) || 21;


const cmPerPixel =
    realHeight /
    pixelHeight;


/*
 * Centro de la botella.
 */

const centerX =
    (top.x + bottom.x) / 2;


/*
 * Radio máximo.
 */

const maxRadius =
    valorAbsoluto(
        maxPoint.x -
        centerX
    ) * cmPerPixel;


/*
 * Radio mínimo.
 */

const minRadius =
    valorAbsoluto(
        minPoint.x -
        centerX
    ) * cmPerPixel;


/*
 * Altura de cada punto.
 *
 * En la imagen Y aumenta hacia abajo.
 * Por eso invertimos la coordenada.
 */

function convertirYAZ(y) {

    return (
        bottom.y - y
    ) * cmPerPixel;
}


let maxHeight =
    convertirYAZ(
        maxPoint.y
    );


let minHeight =
    convertirYAZ(
        minPoint.y
    );


/*
 * Limitar alturas al recipiente.
 */

maxHeight =
    Math.max(
        0,
        Math.min(
            realHeight,
            maxHeight
        )
    );


minHeight =
    Math.max(
        0,
        Math.min(
            realHeight,
            minHeight
        )
    );


return {

    realHeight: realHeight,

    centerX: centerX,

    maxRadius: maxRadius,

    minRadius: minRadius,

    maxHeight: maxHeight,

    minHeight: minHeight

};
```

}

/* ============================================================
RADIO A PARTIR DE LOS 4 PUNTOS
============================================================ */

function radioEnAltura(
z,
geometria
) {

```
const H =
    geometria.realHeight;

const rMax =
    geometria.maxRadius;

const rMin =
    geometria.minRadius;

const zMax =
    geometria.maxHeight;

const zMin =
    geometria.minHeight;


/*
 * Creamos dos puntos adicionales:
 *
 * (0, rMin)
 * (H, rMin)
 *
 * y usamos los puntos reales
 * de radio mínimo y máximo.
 */

const puntos = [

    {
        z: 0,
        r: rMin
    },

    {
        z: zMax,
        r: rMax
    },

    {
        z: zMin,
        r: rMin
    },

    {
        z: H,
        r: rMin
    }

];


/*
 * Ordenar por altura.
 */

puntos.sort(
    (a, b) => a.z - b.z
);


/*
 * Si estamos antes del primer punto.
 */

if (z <= puntos[0].z) {

    return puntos[0].r;
}


/*
 * Buscar segmento correspondiente.
 */

for (
    let i = 0;
    i < puntos.length - 1;
    i++
) {

    const p0 =
        puntos[i];

    const p1 =
        puntos[i + 1];


    if (
        z >= p0.z &&
        z <= p1.z
    ) {

        const diferencia =
            p1.z - p0.z;


        if (
            valorAbsoluto(diferencia)
            < 0.000001
        ) {

            return p0.r;
        }


        const t =
            (z - p0.z) /
            diferencia;


        return (
            p0.r +
            t * (p1.r - p0.r)
        );

    }

}


return puntos[
    puntos.length - 1
].r;
```

}

/* ============================================================
FUNCIÓN DE VOLUMEN
============================================================ */

function calcularVolumenHastaAltura(
h,
geometria
) {

```
if (h <= 0) {
    return 0;
}


if (
    h > geometria.realHeight
) {

    h =
        geometria.realHeight;
}


const n = 20;

const dz =
    h / n;


let volumen = 0;


for (
    let i = 0;
    i < n;
    i++
) {

    const z0 =
        i * dz;

    const z1 =
        (i + 1) * dz;


    const r0 =
        radioEnAltura(
            z0,
            geometria
        );


    const r1 =
        radioEnAltura(
            z1,
            geometria
        );


    const area0 =
        PI_MANUAL *
        elevarAlCuadrado(r0);


    const area1 =
        PI_MANUAL *
        elevarAlCuadrado(r1);


    volumen +=
        ((area0 + area1) / 2) *
        dz;

}


return volumen;
```

}

/* ============================================================
FUNCIÓN f(h)
============================================================ */

function funcionVolumen(
h,
geometria,
volumenObjetivo
) {

```
return (
    calcularVolumenHastaAltura(
        h,
        geometria
    ) -
    volumenObjetivo
);
```

}

/* ============================================================
BISECCIÓN
============================================================ */

function metodoBiseccion(
objetivo,
geometria
) {

```
let a = 0;

let b =
    geometria.realHeight;


let fa =
    funcionVolumen(
        a,
        geometria,
        objetivo
    );


let fb =
    funcionVolumen(
        b,
        geometria,
        objetivo
    );


if (fa * fb > 0) {

    return null;
}


const tolerancia =
    0.0001;

const maxIteraciones =
    100;


let c = 0;

let error =
    Infinity;

let iteraciones = 0;


while (
    error > tolerancia &&
    iteraciones < maxIteraciones
) {

    c =
        (a + b) / 2;


    const fc =
        funcionVolumen(
            c,
            geometria,
            objetivo
        );


    error =
        valorAbsoluto(fc);


    if (
        fa * fc < 0
    ) {

        b = c;

        fb = fc;

    } else {

        a = c;

        fa = fc;
    }


    iteraciones++;

}


return {

    altura: c,

    volumen:
        calcularVolumenHastaAltura(
            c,
            geometria
        ),

    iteraciones: iteraciones,

    error: error

};
```

}

/* ============================================================
FALSA POSICIÓN
============================================================ */

function metodoFalsaPosicion(
objetivo,
geometria
) {

```
let a = 0;

let b =
    geometria.realHeight;


let fa =
    funcionVolumen(
        a,
        geometria,
        objetivo
    );


let fb =
    funcionVolumen(
        b,
        geometria,
        objetivo
    );


if (fa * fb > 0) {

    return null;
}


const tolerancia =
    0.0001;

const maxIteraciones =
    100;


let x = 0;

let error =
    Infinity;

let iteraciones = 0;


while (
    error > tolerancia &&
    iteraciones < maxIteraciones
) {

    x =
        (
            a * fb -
            b * fa
        ) /
        (
            fb - fa
        );


    const fx =
        funcionVolumen(
            x,
            geometria,
            objetivo
        );


    error =
        valorAbsoluto(fx);


    if (
        fa * fx < 0
    ) {

        b = x;

        fb = fx;

    } else {

        a = x;

        fa = fx;
    }


    iteraciones++;

}


return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            geometria
        ),

    iteraciones: iteraciones,

    error: error

};
```

}

/* ============================================================
PUNTO FIJO
============================================================ */

function metodoPuntoFijo(
objetivo,
geometria
) {

```
let x =
    geometria.realHeight / 2;


const tolerancia =
    0.0001;

const maxIteraciones =
    100;


/*
 * g(x) = x - lambda*f(x)
 */

const lambda =
    0.01;


let error =
    Infinity;

let iteraciones = 0;


while (
    error > tolerancia &&
    iteraciones < maxIteraciones
) {

    const fx =
        funcionVolumen(
            x,
            geometria,
            objetivo
        );


    let nuevoX =
        x -
        lambda * fx;


    nuevoX =
        Math.max(
            0,
            Math.min(
                geometria.realHeight,
                nuevoX
            )
        );


    error =
        valorAbsoluto(
            nuevoX - x
        );


    x =
        nuevoX;


    iteraciones++;

}


const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x,
            geometria,
            objetivo
        )
    );


return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            geometria
        ),

    iteraciones: iteraciones,

    error: errorFuncion

};
```

}

/* ============================================================
NEWTON-RAPHSON
============================================================ */

function metodoNewtonRaphson(
objetivo,
geometria
) {

```
let x =
    geometria.realHeight / 2;


const tolerancia =
    0.0001;

const maxIteraciones =
    100;

const delta =
    0.00001;


let error =
    Infinity;

let iteraciones = 0;


while (
    error > tolerancia &&
    iteraciones < maxIteraciones
) {

    const fx =
        funcionVolumen(
            x,
            geometria,
            objetivo
        );


    const fxDelta =
        funcionVolumen(
            x + delta,
            geometria,
            objetivo
        );


    const derivada =
        (
            fxDelta - fx
        ) /
        delta;


    if (
        valorAbsoluto(
            derivada
        ) < 1e-10
    ) {

        break;
    }


    let nuevoX =
        x -
        fx / derivada;


    nuevoX =
        Math.max(
            0,
            Math.min(
                geometria.realHeight,
                nuevoX
            )
        );


    error =
        valorAbsoluto(
            nuevoX - x
        );


    x =
        nuevoX;


    iteraciones++;

}


const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x,
            geometria,
            objetivo
        )
    );


return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            geometria
        ),

    iteraciones: iteraciones,

    error: errorFuncion

};
```

}

/* ============================================================
SECANTE
============================================================ */

function metodoSecante(
objetivo,
geometria
) {

```
let x0 =
    geometria.realHeight * 0.3;

let x1 =
    geometria.realHeight * 0.8;


const tolerancia =
    0.0001;

const maxIteraciones =
    100;


let error =
    Infinity;

let iteraciones = 0;


while (
    error > tolerancia &&
    iteraciones < maxIteraciones
) {

    const f0 =
        funcionVolumen(
            x0,
            geometria,
            objetivo
        );


    const f1 =
        funcionVolumen(
            x1,
            geometria,
            objetivo
        );


    if (
        valorAbsoluto(
            f1 - f0
        ) < 1e-12
    ) {

        break;
    }


    let x2 =
        x1 -
        f1 *
        (x1 - x0) /
        (f1 - f0);


    x2 =
        Math.max(
            0,
            Math.min(
                geometria.realHeight,
                x2
            )
        );


    error =
        valorAbsoluto(
            x2 - x1
        );


    x0 =
        x1;

    x1 =
        x2;


    iteraciones++;

}


const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x1,
            geometria,
            objetivo
        )
    );


return {

    altura: x1,

    volumen:
        calcularVolumenHastaAltura(
            x1,
            geometria
        ),

    iteraciones: iteraciones,

    error: errorFuncion

};
```

}

/* ============================================================
GENERAR DATASET
============================================================ */

function generarDataset(
geometria
) {

```
const n = 20;

const dataset = [];


for (
    let i = 0;
    i <= n;
    i++
) {

    const z =
        (
            geometria.realHeight /
            n
        ) * i;


    const r =
        radioEnAltura(
            z,
            geometria
        );


    dataset.push({
        z: z,
        r: r
    });

}


return dataset;
```

}

/* ============================================================
VOLUMEN TOTAL
============================================================ */

function calcularVolumenTotal(
dataset
) {

```
let volumen = 0;


for (
    let i = 0;
    i < dataset.length - 1;
    i++
) {

    const z0 =
        dataset[i].z;

    const z1 =
        dataset[i + 1].z;


    const r0 =
        dataset[i].r;

    const r1 =
        dataset[i + 1].r;


    const dz =
        z1 - z0;


    const area0 =
        PI_MANUAL *
        elevarAlCuadrado(r0);


    const area1 =
        PI_MANUAL *
        elevarAlCuadrado(r1);


    volumen +=
        (
            (area0 + area1) /
            2
        ) * dz;

}


return volumen;
```

}

/* ============================================================
MOSTRAR MÉTODOS
============================================================ */

function mostrarResultadosMetodos(
resultados
) {

```
const tbody =
    document.querySelector(
        '#methodsTable tbody'
    );


tbody.innerHTML = '';


resultados.forEach(
    resultado => {

        const row =
            document.createElement(
                'tr'
            );


        if (!resultado) {

            return;
        }


        row.innerHTML = `

            <td>
                ${resultado.nombre}
            </td>

            <td>
                ${resultado.altura.toFixed(4)}
            </td>

            <td>
                ${resultado.volumen.toFixed(4)}
            </td>

            <td>
                ${resultado.iteraciones}
            </td>

            <td>
                ${resultado.error.toFixed(6)}
            </td>

        `;


        tbody.appendChild(row);

    }
);
```

}

/* ============================================================
MOSTRAR DATASET
============================================================ */

function mostrarDataset(
dataset
) {

```
const tbody =
    document.querySelector(
        '#datasetTable tbody'
    );


tbody.innerHTML = '';


dataset.forEach(
    (data, index) => {

        const row =
            document.createElement(
                'tr'
            );


        row.innerHTML = `

            <td>
                ${index + 1}
            </td>

            <td>
                ${data.z.toFixed(2)}
            </td>

            <td>
                ${data.r.toFixed(2)}
            </td>

        `;


        tbody.appendChild(row);

    }
);
```

}

/* ============================================================
DIBUJAR SILUETA
============================================================ */

function dibujarSilueta(
dataset,
geometria
) {

```
const ancho = 650;

const alto = 500;

const margen = 60;


profileCanvas.width =
    ancho;

profileCanvas.height =
    alto;


profileCtx.clearRect(
    0,
    0,
    ancho,
    alto
);


const radioMaximo =
    Math.max(
        geometria.maxRadius,
        0.1
    );


const escalaY =
    (
        alto -
        2 * margen
    ) /
    geometria.realHeight;


const escalaX =
    (
        ancho / 2 -
        margen
    ) /
    radioMaximo;


const centroX =
    ancho / 2;


/*
 * Eje central.
 */

profileCtx.strokeStyle =
    '#777';

profileCtx.lineWidth =
    1;


profileCtx.beginPath();

profileCtx.moveTo(
    centroX,
    margen
);

profileCtx.lineTo(
    centroX,
    alto - margen
);

profileCtx.stroke();


/*
 * Construir contorno.
 */

profileCtx.beginPath();


for (
    let i = 0;
    i < dataset.length;
    i++
) {

    const punto =
        dataset[i];


    const y =
        alto -
        margen -
        punto.z *
        escalaY;


    const x =
        centroX -
        punto.r *
        escalaX;


    if (i === 0) {

        profileCtx.moveTo(
            x,
            y
        );

    } else {

        profileCtx.lineTo(
            x,
            y
        );

    }

}


/*
 * Regresar por el lado derecho.
 */

for (
    let i = dataset.length - 1;
    i >= 0;
    i--
) {

    const punto =
        dataset[i];


    const y =
        alto -
        margen -
        punto.z *
        escalaY;


    const x =
        centroX +
        punto.r *
        escalaX;


    profileCtx.lineTo(
        x,
        y
    );

}


profileCtx.closePath();


profileCtx.fillStyle =
    'rgba(0, 123, 255, 0.15)';

profileCtx.fill();


profileCtx.strokeStyle =
    '#007bff';

profileCtx.lineWidth =
    3;

profileCtx.stroke();


/*
 * Nodos.
 */

profileCtx.fillStyle =
    '#ff1744';


dataset.forEach(
    punto => {

        const y =
            alto -
            margen -
            punto.z *
            escalaY;


        const xIzquierda =
            centroX -
            punto.r *
            escalaX;


        const xDerecha =
            centroX +
            punto.r *
            escalaX;


        profileCtx.beginPath();

        profileCtx.arc(
            xIzquierda,
            y,
            3,
            0,
            2 * PI_MANUAL
        );

        profileCtx.fill();


        profileCtx.beginPath();

        profileCtx.arc(
            xDerecha,
            y,
            3,
            0,
            2 * PI_MANUAL
        );

        profileCtx.fill();

    }
);


/*
 * Etiquetas.
 */

profileCtx.fillStyle =
    '#ffffff';

profileCtx.font =
    '14px Arial';


profileCtx.fillText(
    'Altura (cm)',
    centroX + 10,
    margen - 20
);


profileCtx.fillText(
    'Radio',
    margen,
    alto - 20
);
```

}

/* ============================================================
REINICIAR
============================================================ */

btnReset.addEventListener(
'click',
() => {

```
    calibrationPoints = [];

    imageCaptured = false;

    capturedImageObj = null;


    btnCalculate.disabled =
        true;


    btnCapture.disabled =
        true;


    if (stream) {

        stream.getTracks().forEach(
            track => track.stop()
        );

        stream = null;
    }


    video.srcObject = null;


    video.style.display =
        'none';

    canvas.style.display =
        'none';


    document.getElementById(
        'resultsCard'
    ).style.display =
        'none';


    cameraStatus.textContent =
        'Cámara detenida.';


    cameraStatus.className =
        'camera-status';


    actualizarInstrucciones();

}
```

);

/* ============================================================
CÁLCULO PRINCIPAL
============================================================ */

btnCalculate.addEventListener(
'click',
() => {

```
    if (
        calibrationPoints.length !== 4
    ) {

        alert(
            'Debes seleccionar exactamente 4 puntos.'
        );

        return;
    }


    try {

        const geometria =
            obtenerGeometria();


        if (
            geometria.maxRadius <= 0 ||
            geometria.minRadius <= 0
        ) {

            alert(
                'Los radios obtenidos no son válidos. Revisa los puntos Borde Max y Borde Min.'
            );

            return;
        }


        const volumenObjetivo =
            parseFloat(
                targetVolumeInput.value
            ) || 250;


        /*
         * Crear dataset.
         */

        const dataset =
            generarDataset(
                geometria
            );


        /*
         * Volumen total.
         */

        const volumenTotal =
            calcularVolumenTotal(
                dataset
            );


        /*
         * Métodos.
         */

        const resultados = [

            {
                nombre: 'Bisección',

                resultado:
                    metodoBiseccion(
                        volumenObjetivo,
                        geometria
                    )
            },

            {
                nombre: 'Falsa Posición',

                resultado:
                    metodoFalsaPosicion(
                        volumenObjetivo,
                        geometria
                    )
            },

            {
                nombre: 'Punto Fijo',

                resultado:
                    metodoPuntoFijo(
                        volumenObjetivo,
                        geometria
                    )
            },

            {
                nombre: 'Newton-Raphson',

                resultado:
                    metodoNewtonRaphson(
                        volumenObjetivo,
                        geometria
                    )
            },

            {
                nombre: 'Secante',

                resultado:
                    metodoSecante(
                        volumenObjetivo,
                        geometria
                    )
            }

        ];


        const resultadosFormateados =
            resultados.map(
                item => {

                    if (!item.resultado) {
                        return null;
                    }


                    return {

                        nombre:
                            item.nombre,

                        ...item.resultado

                    };

                }
            );


        /*
         * Mostrar resumen.
         */

        document.getElementById(
            'volResult'
        ).textContent =
            volumenTotal.toFixed(2);


        document.getElementById(
            'pointsCount'
        ).textContent =
            dataset.length;


        document.getElementById(
            'targetResult'
        ).textContent =
            volumenObjetivo.toFixed(2);


        /*
         * Mostrar resultados.
         */

        mostrarResultadosMetodos(
            resultadosFormateados
        );


        /*
         * Mostrar dataset.
         */

        mostrarDataset(
            dataset
        );


        /*
         * Dibujar silueta.
         */

        dibujarSilueta(
            dataset,
            geometria
        );


        /*
         * Mostrar tarjeta.
         */

        document.getElementById(
            'resultsCard'
        ).style.display =
            'block';

    } catch (error) {

        console.error(error);

        alert(
            'Ocurrió un error durante el cálculo: ' +
            error.message
        );

    }

}
```

);
