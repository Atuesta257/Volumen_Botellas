const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const profileCanvas = document.getElementById('profileCanvas');
const profileCtx = profileCanvas.getContext('2d');

const btnStartCamera = document.getElementById('btnStartCamera');
const btnCapture = document.getElementById('btnCapture');
const btnReset = document.getElementById('btnReset');
const btnCalculate = document.getElementById('btnCalculate');

const realHeightInput = document.getElementById('realHeight');
const targetVolumeInput = document.getElementById('targetVolume');

let stream = null;
let calibrationPoints = [];
let imageCaptured = false;
let capturedImageObj = null;

const PI_MANUAL = 3.141592653589793;

/* ============================================================
FUNCIONES MATEMÁTICAS
============================================================ */

function elevarAlCuadrado(base) {
return base * base;
}

function valorAbsoluto(numero) {
return numero < 0 ? -numero : numero;
}

/* ============================================================
AJUSTE AUTOMÁTICO AL BORDE
============================================================ */

function snapToRealEdge(xClick, yClick) {

```
const searchRange = 12;

let startX = Math.max(
    0,
    Math.floor(xClick - searchRange)
);

let width = searchRange * 2;

let imgData;

try {

    imgData = ctx.getImageData(
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

for (let i = 0; i < imgData.length - 8; i += 4) {

    let brightnessCurrent =
        (imgData[i] +
         imgData[i + 1] +
         imgData[i + 2]) / 3;

    let brightnessNext =
        (imgData[i + 4] +
         imgData[i + 5] +
         imgData[i + 6]) / 3;

    let gradient =
        valorAbsoluto(
            brightnessNext - brightnessCurrent
        );

    if (gradient > maxGradient) {

        maxGradient = gradient;

        let offset =
            (i / 4) - searchRange;

        bestX = xClick + offset;
    }
}

return maxGradient > 15 ? bestX : xClick;
```

}

/* ============================================================
MODELO GEOMÉTRICO DE LA BOTELLA
============================================================ */

function radioEnAltura(z, maxRadiusCm, realHeightCm) {

```
const porcentajeAltura =
    z / realHeightCm;

if (porcentajeAltura <= 0.80) {
    return maxRadiusCm;
}

const factorCuello =
    1 -
    ((porcentajeAltura - 0.80) / 0.20) * 0.25;

return maxRadiusCm * factorCuello;
```

}

/* ============================================================
VOLUMEN HASTA UNA ALTURA
REGLA DEL TRAPECIO
============================================================ */

function calcularVolumenHastaAltura(
hEval,
maxRadiusCm,
realHeightCm
) {

```
if (hEval <= 0) {
    return 0;
}

if (hEval > realHeightCm) {
    hEval = realHeightCm;
}

const n = 12;

const dz = hEval / n;

let volumen = 0;

for (let i = 0; i < n; i++) {

    const z0 = i * dz;
    const z1 = (i + 1) * dz;

    const r0 =
        radioEnAltura(
            z0,
            maxRadiusCm,
            realHeightCm
        );

    const r1 =
        radioEnAltura(
            z1,
            maxRadiusCm,
            realHeightCm
        );

    const area0 =
        PI_MANUAL * elevarAlCuadrado(r0);

    const area1 =
        PI_MANUAL * elevarAlCuadrado(r1);

    volumen +=
        ((area0 + area1) / 2) * dz;
}

return volumen;
```

}

/* ============================================================
FUNCIÓN DEL PROBLEMA
f(h) = V(h) - Vobjetivo
============================================================ */

function funcionVolumen(
h,
maxRadiusCm,
realHeightCm,
volumenObjetivo
) {

```
return calcularVolumenHastaAltura(
    h,
    maxRadiusCm,
    realHeightCm
) - volumenObjetivo;
```

}

/* ============================================================
MÉTODO DE BISECCIÓN
============================================================ */

function metodoBiseccion(
volumenObjetivo,
maxRadiusCm,
realHeightCm
) {

```
let a = 0;
let b = realHeightCm;

const tolerancia = 0.001;
const maxIteraciones = 100;

let fa = funcionVolumen(
    a,
    maxRadiusCm,
    realHeightCm,
    volumenObjetivo
);

let fb = funcionVolumen(
    b,
    maxRadiusCm,
    realHeightCm,
    volumenObjetivo
);

if (fa * fb > 0) {

    return {
        altura: null,
        volumen: null,
        iteraciones: 0,
        error: null
    };
}

let medio = 0;
let error = Infinity;
let iteracion = 0;

while (
    error > tolerancia &&
    iteracion < maxIteraciones
) {

    medio = (a + b) / 2;

    const fm = funcionVolumen(
        medio,
        maxRadiusCm,
        realHeightCm,
        volumenObjetivo
    );

    error = valorAbsoluto(fm);

    if (fa * fm < 0) {

        b = medio;
        fb = fm;

    } else {

        a = medio;
        fa = fm;
    }

    iteracion++;
}

return {

    altura: medio,

    volumen:
        calcularVolumenHastaAltura(
            medio,
            maxRadiusCm,
            realHeightCm
        ),

    iteraciones: iteracion,

    error: error
};
```

}

/* ============================================================
MÉTODO DE FALSA POSICIÓN
============================================================ */

function metodoFalsaPosicion(
volumenObjetivo,
maxRadiusCm,
realHeightCm
) {

```
let a = 0;
let b = realHeightCm;

const tolerancia = 0.001;
const maxIteraciones = 100;

let fa = funcionVolumen(
    a,
    maxRadiusCm,
    realHeightCm,
    volumenObjetivo
);

let fb = funcionVolumen(
    b,
    maxRadiusCm,
    realHeightCm,
    volumenObjetivo
);

if (fa * fb > 0) {

    return {
        altura: null,
        volumen: null,
        iteraciones: 0,
        error: null
    };
}

let x = 0;
let error = Infinity;
let iteracion = 0;

while (
    error > tolerancia &&
    iteracion < maxIteraciones
) {

    x =
        (a * fb - b * fa) /
        (fb - fa);

    const fx = funcionVolumen(
        x,
        maxRadiusCm,
        realHeightCm,
        volumenObjetivo
    );

    error = valorAbsoluto(fx);

    if (fa * fx < 0) {

        b = x;
        fb = fx;

    } else {

        a = x;
        fa = fx;
    }

    iteracion++;
}

return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            maxRadiusCm,
            realHeightCm
        ),

    iteraciones: iteracion,

    error: error
};
```

}

/* ============================================================
MÉTODO DE PUNTO FIJO
g(h) = h - lambda * f(h)
============================================================ */

function metodoPuntoFijo(
volumenObjetivo,
maxRadiusCm,
realHeightCm
) {

```
let x = realHeightCm * 0.5;

const tolerancia = 0.001;
const maxIteraciones = 100;

/*
   Lambda pequeño para evitar saltos excesivos.
*/
const lambda = 0.01;

let error = Infinity;
let iteracion = 0;

while (
    error > tolerancia &&
    iteracion < maxIteraciones
) {

    const fx = funcionVolumen(
        x,
        maxRadiusCm,
        realHeightCm,
        volumenObjetivo
    );

    let xNuevo = x - lambda * fx;

    if (xNuevo < 0) {
        xNuevo = 0;
    }

    if (xNuevo > realHeightCm) {
        xNuevo = realHeightCm;
    }

    error =
        valorAbsoluto(xNuevo - x);

    x = xNuevo;

    iteracion++;
}

const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        )
    );

return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            maxRadiusCm,
            realHeightCm
        ),

    iteraciones: iteracion,

    error: errorFuncion
};
```

}

/* ============================================================
MÉTODO DE NEWTON-RAPHSON
============================================================ */

function metodoNewtonRaphson(
volumenObjetivo,
maxRadiusCm,
realHeightCm
) {

```
let x =
    realHeightCm * 0.5;

const tolerancia = 0.001;
const maxIteraciones = 100;

const delta = 0.0001;

let error = Infinity;
let iteracion = 0;

while (
    error > tolerancia &&
    iteracion < maxIteraciones
) {

    const fx =
        funcionVolumen(
            x,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        );

    const fxDelta =
        funcionVolumen(
            x + delta,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        );

    const derivada =
        (fxDelta - fx) / delta;

    if (valorAbsoluto(derivada) < 1e-10) {
        break;
    }

    let xNuevo =
        x - fx / derivada;

    if (xNuevo < 0) {
        xNuevo = 0;
    }

    if (xNuevo > realHeightCm) {
        xNuevo = realHeightCm;
    }

    error =
        valorAbsoluto(xNuevo - x);

    x = xNuevo;

    iteracion++;
}

const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        )
    );

return {

    altura: x,

    volumen:
        calcularVolumenHastaAltura(
            x,
            maxRadiusCm,
            realHeightCm
        ),

    iteraciones: iteracion,

    error: errorFuncion
};
```

}

/* ============================================================
MÉTODO DE LA SECANTE
============================================================ */

function metodoSecante(
volumenObjetivo,
maxRadiusCm,
realHeightCm
) {

```
let x0 =
    realHeightCm * 0.4;

let x1 =
    realHeightCm * 0.9;

const tolerancia = 0.001;
const maxIteraciones = 100;

let error = Infinity;
let iteracion = 0;

while (
    error > tolerancia &&
    iteracion < maxIteraciones
) {

    const f0 =
        funcionVolumen(
            x0,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        );

    const f1 =
        funcionVolumen(
            x1,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        );

    if (valorAbsoluto(f1 - f0) < 1e-10) {
        break;
    }

    let x2 =
        x1 -
        f1 * (x1 - x0) /
        (f1 - f0);

    if (x2 < 0) {
        x2 = 0;
    }

    if (x2 > realHeightCm) {
        x2 = realHeightCm;
    }

    error =
        valorAbsoluto(x2 - x1);

    x0 = x1;
    x1 = x2;

    iteracion++;
}

const errorFuncion =
    valorAbsoluto(
        funcionVolumen(
            x1,
            maxRadiusCm,
            realHeightCm,
            volumenObjetivo
        )
    );

return {

    altura: x1,

    volumen:
        calcularVolumenHastaAltura(
            x1,
            maxRadiusCm,
            realHeightCm
        ),

    iteraciones: iteracion,

    error: errorFuncion
};
```

}

/* ============================================================
GENERAR DATASET
============================================================ */

function generarDataset(
maxRadiusCm,
realHeightCm
) {

```
const n = 12;

const dz =
    realHeightCm / n;

const dataset = [];

for (let i = 0; i <= n; i++) {

    const z =
        i * dz;

    const r =
        radioEnAltura(
            z,
            maxRadiusCm,
            realHeightCm
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
VOLUMEN TOTAL POR REGLA DEL TRAPECIO
============================================================ */

function calcularVolumenTotal(dataset) {

```
let volumen = 0;

for (
    let i = 0;
    i < dataset.length - 1;
    i++
) {

    const z0 = dataset[i].z;
    const z1 = dataset[i + 1].z;

    const r0 = dataset[i].r;
    const r1 = dataset[i + 1].r;

    const deltaZ =
        z1 - z0;

    const area0 =
        PI_MANUAL *
        elevarAlCuadrado(r0);

    const area1 =
        PI_MANUAL *
        elevarAlCuadrado(r1);

    volumen +=
        ((area0 + area1) / 2) *
        deltaZ;
}

return volumen;
```

}

/* ============================================================
MOSTRAR RESULTADOS
============================================================ */

function mostrarResultadosMetodos(resultados) {

```
const tbody =
    document.querySelector(
        '#methodsTable tbody'
    );

tbody.innerHTML = '';

resultados.forEach(resultado => {

    const row =
        document.createElement('tr');

    if (resultado.altura === null) {

        row.innerHTML = `
            <td>${resultado.nombre}</td>
            <td>No encontrado</td>
            <td>-</td>
            <td>${resultado.iteraciones}</td>
            <td>-</td>
        `;

    } else {

        row.innerHTML = `
            <td>${resultado.nombre}</td>
            <td>${resultado.altura.toFixed(4)}</td>
            <td>${resultado.volumen.toFixed(4)}</td>
            <td>${resultado.iteraciones}</td>
            <td>${resultado.error.toFixed(6)}</td>
        `;
    }

    tbody.appendChild(row);
});
```

}

/* ============================================================
MOSTRAR DATASET
============================================================ */

function mostrarDataset(dataset) {

```
const tbody =
    document.querySelector(
        '#datasetTable tbody'
    );

tbody.innerHTML = '';

dataset.forEach((data, index) => {

    const row =
        document.createElement('tr');

    row.innerHTML = `
        <td>${index + 1}</td>
        <td>${data.z.toFixed(2)}</td>
        <td>${data.r.toFixed(2)}</td>
    `;

    tbody.appendChild(row);
});
```

}

/* ============================================================
DIBUJAR SILUETA
============================================================ */

function dibujarSilueta(
dataset,
realHeightCm,
maxRadiusCm
) {

```
const ancho = 600;
const alto = 500;

profileCanvas.width = ancho;
profileCanvas.height = alto;

profileCtx.clearRect(
    0,
    0,
    ancho,
    alto
);

const margen = 60;

const escalaY =
    (alto - 2 * margen) /
    realHeightCm;

const escalaX =
    (ancho / 2 - margen) /
    maxRadiusCm;

const centroX =
    ancho / 2;

/*
   Eje vertical
*/

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
   Lado izquierdo
*/

profileCtx.beginPath();

for (let i = 0; i < dataset.length; i++) {

    const punto = dataset[i];

    const x =
        centroX -
        punto.r * escalaX;

    const y =
        alto -
        margen -
        punto.z * escalaY;

    if (i === 0) {
        profileCtx.moveTo(x, y);
    } else {
        profileCtx.lineTo(x, y);
    }
}

/*
   Lado derecho
*/

for (
    let i = dataset.length - 1;
    i >= 0;
    i--
) {

    const punto = dataset[i];

    const x =
        centroX +
        punto.r * escalaX;

    const y =
        alto -
        margen -
        punto.z * escalaY;

    profileCtx.lineTo(x, y);
}

profileCtx.closePath();

profileCtx.stroke();

/*
   Relleno transparente
*/

profileCtx.fillStyle =
    'rgba(0, 123, 255, 0.15)';

profileCtx.fill();

/*
   Dibujar nodos
*/

profileCtx.fillStyle =
    '#007bff';

dataset.forEach(punto => {

    const y =
        alto -
        margen -
        punto.z * escalaY;

    const xIzquierda =
        centroX -
        punto.r * escalaX;

    const xDerecha =
        centroX +
        punto.r * escalaX;

    profileCtx.beginPath();

    profileCtx.arc(
        xIzquierda,
        y,
        4,
        0,
        2 * PI_MANUAL
    );

    profileCtx.fill();

    profileCtx.beginPath();

    profileCtx.arc(
        xDerecha,
        y,
        4,
        0,
        2 * PI_MANUAL
    );

    profileCtx.fill();
});

/*
   Etiquetas
*/

profileCtx.fillStyle = '#000';
profileCtx.font = '14px Arial';

profileCtx.fillText(
    'Altura (cm)',
    centroX + 10,
    margen - 20
);

profileCtx.fillText(
    'Radio',
    centroX + maxRadiusCm * escalaX,
    alto - margen + 30
);
```

}

/* ============================================================
CÁMARA
============================================================ */

btnStartCamera.addEventListener(
'click',
async () => {

```
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

    } catch (err) {

        alert(
            'Error al acceder a la cámara. ' +
            'Asegúrate de permitir el acceso y utilizar HTTPS o localhost.'
        );
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

        const tracks =
            stream.getTracks();

        for (
            let i = 0;
            i < tracks.length;
            i++
        ) {

            tracks[i].stop();
        }
    }

    video.style.display = 'none';
    canvas.style.display = 'block';

    btnCapture.disabled = true;

    imageCaptured = true;

    capturedImageObj =
        new Image();

    capturedImageObj.src =
        canvas.toDataURL('image/png');
}
```

);

/* ============================================================
SELECCIÓN DE LOS 3 PUNTOS
============================================================ */

canvas.addEventListener(
'click',
(e) => {

```
    if (!imageCaptured) {
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
        (e.clientX - rect.left) *
        scaleX;

    let y =
        (e.clientY - rect.top) *
        scaleY;

    /*
       El tercer punto se ajusta
       automáticamente al borde.
    */

    if (calibrationPoints.length === 2) {

        x =
            snapToRealEdge(
                x,
                y
            );
    }

    if (calibrationPoints.length < 3) {

        calibrationPoints.push({
            x: x,
            y: y
        });

        redrawCanvas();

        if (
            calibrationPoints.length === 3
        ) {

            btnCalculate.disabled =
                false;
        }
    }
}
```

);

/* ============================================================
REDIBUJAR CANVAS
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
        0
    );
}

const labels = [
    'Tapa',
    'Base',
    'Borde Max'
];

const colors = [
    '#007bff',
    '#007bff',
    '#ff1744'
];

for (
    let i = 0;
    i < calibrationPoints.length;
    i++
) {

    const pt =
        calibrationPoints[i];

    ctx.fillStyle =
        colors[i];

    ctx.beginPath();

    ctx.arc(
        pt.x,
        pt.y,
        7,
        0,
        2 * PI_MANUAL
    );

    ctx.fill();

    ctx.fillStyle = 'white';

    ctx.font =
        'bold 13px sans-serif';

    ctx.fillText(
        labels[i],
        pt.x + 10,
        pt.y + 4
    );
}

if (
    calibrationPoints.length >= 2
) {

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

    btnCalculate.disabled =
        true;

    document.getElementById(
        'resultsCard'
    ).style.display = 'none';

    redrawCanvas();
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
        calibrationPoints.length < 3
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

    /*
       Altura en píxeles
    */

    const pixelHeight =
        valorAbsoluto(
            bottomPt.y -
            topPt.y
        );

    if (pixelHeight <= 0) {

        alert(
            'La tapa debe estar por encima de la base.'
        );

        return;
    }

    /*
       Conversión píxeles/cm
    */

    const cmPerPixel =
        realHeightCm /
        pixelHeight;

    /*
       Centro aproximado
    */

    const centerXPixel =
        (topPt.x +
         bottomPt.x) / 2;

    /*
       Radio máximo
    */

    const maxRadiusCm =
        valorAbsoluto(
            maxRadiusPt.x -
            centerXPixel
        ) * cmPerPixel;

    if (maxRadiusCm <= 0) {

        alert(
            'El punto Borde Max debe estar separado del centro de la botella.'
        );

        return;
    }

    /*
       Crear dataset
    */

    const dataset =
        generarDataset(
            maxRadiusCm,
            realHeightCm
        );

    /*
       Volumen total
    */

    const volumeCm3 =
        calcularVolumenTotal(
            dataset
        );

    /*
       Ejecutar métodos
    */

    const biseccion =
        metodoBiseccion(
            volumenObjetivo,
            maxRadiusCm,
            realHeightCm
        );

    const falsaPosicion =
        metodoFalsaPosicion(
            volumenObjetivo,
            maxRadiusCm,
            realHeightCm
        );

    const puntoFijo =
        metodoPuntoFijo(
            volumenObjetivo,
            maxRadiusCm,
            realHeightCm
        );

    const newton =
        metodoNewtonRaphson(
            volumenObjetivo,
            maxRadiusCm,
            realHeightCm
        );

    const secante =
        metodoSecante(
            volumenObjetivo,
            maxRadiusCm,
            realHeightCm
        );

    const resultados = [

        {
            nombre: 'Bisección',
            ...biseccion
        },

        {
            nombre: 'Falsa Posición',
            ...falsaPosicion
        },

        {
            nombre: 'Punto Fijo',
            ...puntoFijo
        },

        {
            nombre: 'Newton-Raphson',
            ...newton
        },

        {
            nombre: 'Secante',
            ...secante
        }
    ];

    /*
       Mostrar resultados
    */

    document.getElementById(
        'volResult'
    ).textContent =
        volumeCm3.toFixed(2);

    document.getElementById(
        'pointsCount'
    ).textContent =
        dataset.length;

    document.getElementById(
        'targetResult'
    ).textContent =
        volumenObjetivo.toFixed(2);

    mostrarResultadosMetodos(
        resultados
    );

    mostrarDataset(
        dataset
    );

    /*
       Dibujar silueta
    */

    dibujarSilueta(
        dataset,
        realHeightCm,
        maxRadiusCm
    );

    /*
       Mostrar tarjeta
    */

    document.getElementById(
        'resultsCard'
    ).style.display = 'block';
}
```

);
