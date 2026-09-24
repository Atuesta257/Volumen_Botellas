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

        const currentY = bottomPt.y - (i * (bottomPt.y - topPt.y) / n);
        const z_i = i * (realHeightCm / n);
        let detectedRadiusPx = maxRadiusPx;
        const searchWidth = Math.max(10, Math.floor(maxRadiusPx * 1.3));

        try {
            const imgDataRight = ctx.getImageData(
                Math.floor(centerXPixel),
                Math.floor(currentY),
                searchWidth,
                1
            ).data;

            let maxGrad = 0;
            let bestOffset = detectedRadiusPx;

            for (let px = 4; px < imgDataRight.length - 8; px += 4) {
                const b1 = (imgDataRight[px] + imgDataRight[px + 1] + imgDataRight[px + 2]) / 3;
                const b2 = (imgDataRight[px + 4] + imgDataRight[px + 5] + imgDataRight[px + 6]) / 3;
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
        const limiteInferior = Math.max(minRadiusCm * 0.90, maxRadiusCm * 0.10);

        r_i = Math.min(r_i, limiteSuperior);
        r_i = Math.max(r_i, limiteInferior);

        rawNodes.push({ z: z_i, r: r_i });
    }

    const zMax = Math.abs(bottomPt.y - maxRadiusPt.y) * cmPerPixel;
    const zMin = Math.abs(bottomPt.y - minRadiusPt.y) * cmPerPixel;

    rawNodes.push({
        z: Math.max(0, Math.min(realHeightCm, zMax)),
        r: maxRadiusCm
    });

    rawNodes.push({
        z: Math.max(0, Math.min(realHeightCm, zMin)),
        r: minRadiusCm
    });

    rawNodes.sort((a, b) => a.z - b.z);

    const nodosOrdenados = [];
    rawNodes.forEach(nodo => {
        const ultimo = nodosOrdenados[nodosOrdenados.length - 1];
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
        if (h[i] <= 0) h[i] = 0.000001;
    }

    let alpha = new Array(n + 1).fill(0);
    for (let i = 1; i < n; i++) {
        alpha[i] = (3 / h[i]) * (a[i + 1] - a[i]) - (3 / h[i - 1]) * (a[i] - a[i - 1]);
    }

    let l = new Array(n + 1).fill(0);
    let mu = new Array(n + 1).fill(0);
    let z = new Array(n + 1).fill(0);

    l[0] = 1;

    for (let i = 1; i < n; i++) {
        l[i] = 2 * (nodes[i + 1].z - nodes[i - 1].z) - h[i - 1] * mu[i - 1];
        if (Math.abs(l[i]) < 1e-12) l[i] = 1e-12;
        mu[i] = h[i] / l[i];
        z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    l[n] = 1;
    z[n] = 0;

    let c = new Array(n + 1).fill(0);
    let b = new Array(n).fill(0);
    let d = new Array(n).fill(0);

    for (let j = n - 1; j >= 0; j--) {
        c[j] = z[j] - mu[j] * c[j + 1];
        b[j] = (a[j + 1] - a[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
        d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }

    return function (zEval) {
        if (zEval <= nodes[0].z) return nodes[0].r;
        if (zEval >= nodes[n].z) return nodes[n].r;

        let i = 0;
        for (let j = 0; j < n; j++) {
            if (zEval >= nodes[j].z && zEval <= nodes[j + 1].z) {
                i = j;
                break;
            }
        }

        const dx = zEval - nodes[i].z;
        return (a[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx);
    };
}


// =============================================================
// 3. INTEGRACIÓN SIMPSON 1/3 Y FUNCIÓN OBJETIVO
// =============================================================

function integrarSimpson(rFunc, zMin, zMax, numIntervalos = 80) {
    if (zMin >= zMax) return 0;
    if (numIntervalos % 2 !== 0) numIntervalos++;

    const h = (zMax - zMin) / numIntervalos;
    let suma = Math.pow(rFunc(zMin), 2) + Math.pow(rFunc(zMax), 2);

    for (let i = 1; i < numIntervalos; i++) {
        const z = zMin + i * h;
        const r = Math.max(0, rFunc(z));
        const factor = i % 2 === 0 ? 2 : 4;
        suma += factor * Math.pow(r, 2);
    }
    return (PI * h / 3) * suma;
}

function fObjetivo(h, vObjetivo, rFunc) {
    return integrarSimpson(rFunc, 0, h) - vObjetivo;
}


// =============================================================
// 4. MÉTODOS NUMÉRICOS DE BÚSQUEDA DE RAÍCES
// =============================================================

function metodoNewtonRaphson(vObjetivo, rFunc, maxH, tol = TOLERANCIA, maxIter = MAX_ITERACIONES) {
    let h = maxH * 0.5, iter = 0;
    while (iter < maxIter) {
        let fh = fObjetivo(h, vObjetivo, rFunc);
        if (Math.abs(fh) < tol) break;
        let r_h = rFunc(h);
        let dfh = PI * r_h * r_h; // Derivada dV/dh = Área transversal A(h)
        if (Math.abs(dfh) < 1e-6) break;
        let hNext = h - fh / dfh;
        if (Math.abs(hNext - h) < tol) break;
        h = hNext;
        iter++;
    }
    return { altura: Math.min(Math.max(h, 0), maxH), iter };
}


// =============================================================
// 5. CONTROL DE CÁMARA Y EVENTOS DE INTERFAZ
// =============================================================

// ACTIVAR CÁMARA TRASERA
btnStartCamera.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
        video.style.display = 'block';
        canvas.style.display = 'none';
        
        btnCapture.disabled = false;
        btnStartCamera.disabled = true;
        imageCaptured = false;
        calibrationPoints = [];
        if (pointStatus) pointStatus.innerText = "Cámara lista. Haz clic en 'Capturar imagen'.";
    } catch (err) {
        alert('Error al acceder a la cámara trasera. Verifica los permisos.');
        console.error(err);
    }
});

// CAPTURAR FOTOGRAMA EN EL CANVAS
btnCapture.addEventListener('click', () => {
    if (!stream) return;

    // Ajustar el tamaño del lienzo a las dimensiones reales de la cámara
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Pintar el fotograma actual en el contexto 2D
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Ocultar video streaming y mostrar el Canvas estático
    video.style.display = 'none';
    canvas.style.display = 'block';
    
    imageCaptured = true;
    btnCapture.disabled = true;
    
    // Detener la transmisión de la cámara para liberar recursos de hardware
    stream.getTracks().forEach(track => track.stop());
    stream = null;

    if (pointStatus) {
        pointStatus.innerText = "Imagen capturada. Haz 4 clics en el orden: 1. Tapa, 2. Base, 3. Radio Máx, 4. Radio Mín.";
    }
});

// CAPTURA DE PUNTOS MANUALES SOBRE EL CANVAS
canvas.addEventListener('click', (e) => {
    if (!imageCaptured || calibrationPoints.length >= 4) return;

    // Calcular las coordenadas exactas escaladas al lienzo
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    calibrationPoints.push({ x, y });

    // Dibujar una marca visual del punto seleccionado
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();

    const nombresPuntos = ["Tapa", "Base", "Radio Máximo", "Radio Mínimo"];
