/**
 * Minimal QR code generator producing inline SVG.
 * Implements QR encoding (byte mode, EC level L, mask 0) for versions 1-20.
 */

export function generateQrSvg(text: string): string {
  const modules = encodeQr(text);
  const size = modules.length;
  const cellSize = 4;
  const margin = 4;
  const svgSize = (size + margin * 2) * cellSize;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">`;
  svg += `<rect width="${svgSize}" height="${svgSize}" fill="white"/>`;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y]![x]) {
        svg += `<rect x="${(x + margin) * cellSize}" y="${(y + margin) * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

function encodeQr(text: string): boolean[][] {
  const data = textToBytes(text);
  const version = getMinVersion(data.length);
  const size = version * 4 + 17;

  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null) as (boolean | null)[]
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false) as boolean[]
  );

  placeFinderPattern(matrix, reserved, 0, 0);
  placeFinderPattern(matrix, reserved, size - 7, 0);
  placeFinderPattern(matrix, reserved, 0, size - 7);

  const alignPositions = getAlignmentPositions(version);
  for (const ay of alignPositions) {
    for (const ax of alignPositions) {
      if (isFinderArea(ax, ay, size)) continue;
      placeAlignmentPattern(matrix, reserved, ax, ay);
    }
  }

  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6]![i]) {
      matrix[6]![i] = i % 2 === 0;
      reserved[6]![i] = true;
    }
    if (!reserved[i]![6]) {
      matrix[i]![6] = i % 2 === 0;
      reserved[i]![6] = true;
    }
  }

  matrix[size - 8]![8] = true;
  reserved[size - 8]![8] = true;

  for (let i = 0; i < 9; i++) {
    if (i < size) {
      reserved[8]![i] = true;
      reserved[i]![8] = true;
    }
    if (size - 1 - i >= 0 && size - 1 - i < size) {
      reserved[8]![size - 1 - i] = true;
    }
    if (i < size && size - 1 - i >= 0) {
      reserved[size - 1 - i]![8] = true;
    }
  }

  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i]![size - 11 + j] = true;
        reserved[size - 11 + j]![i] = true;
      }
    }
  }

  const encoded = encodeData(data, version);
  placeDataBits(matrix, reserved, encoded, size);
  applyMask(matrix, reserved, size);
  placeFormatInfo(matrix, size);

  if (version >= 7) {
    placeVersionInfo(matrix, version, size);
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

function textToBytes(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

const VERSION_CAPACITIES = [
  0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271,
  321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
];

function getMinVersion(dataLen: number): number {
  for (let v = 1; v <= 20; v++) {
    if (VERSION_CAPACITIES[v]! >= dataLen) return v;
  }
  return 20;
}

function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const positions = [6];
  const last = version * 4 + 10;
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((last - 6) / (count - 1));
  for (let i = 1; i < count; i++) {
    positions.push(6 + i * step);
  }
  positions[positions.length - 1] = last;
  return positions;
}

function isFinderArea(x: number, y: number, size: number): boolean {
  return (x <= 8 && y <= 8) || (x <= 8 && y >= size - 8) || (x >= size - 8 && y <= 8);
}

function placeFinderPattern(
  matrix: (boolean | null)[][],
  reserved: boolean[][],
  row: number,
  col: number,
) {
  const pattern = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr < 0 || mr >= matrix.length || mc < 0 || mc >= matrix.length) continue;
      if (r >= 0 && r < 7 && c >= 0 && c < 7) {
        matrix[mr]![mc] = pattern[r]![c] === 1;
      } else {
        matrix[mr]![mc] = false;
      }
      reserved[mr]![mc] = true;
    }
  }
}

function placeAlignmentPattern(
  matrix: (boolean | null)[][],
  reserved: boolean[][],
  centerX: number,
  centerY: number,
) {
  const pattern = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
  ];

  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const mr = centerY + r;
      const mc = centerX + c;
      if (mr >= 0 && mr < matrix.length && mc >= 0 && mc < matrix.length) {
        matrix[mr]![mc] = pattern[r + 2]![c + 2] === 1;
        reserved[mr]![mc] = true;
      }
    }
  }
}

const EC_TABLE: Record<number, { totalCw: number; ecPerBlock: number; blocks: number }> = {
  1: { totalCw: 26, ecPerBlock: 7, blocks: 1 },
  2: { totalCw: 44, ecPerBlock: 10, blocks: 1 },
  3: { totalCw: 70, ecPerBlock: 15, blocks: 1 },
  4: { totalCw: 100, ecPerBlock: 20, blocks: 1 },
  5: { totalCw: 134, ecPerBlock: 26, blocks: 1 },
  6: { totalCw: 172, ecPerBlock: 18, blocks: 2 },
  7: { totalCw: 196, ecPerBlock: 20, blocks: 2 },
  8: { totalCw: 242, ecPerBlock: 24, blocks: 2 },
  9: { totalCw: 292, ecPerBlock: 30, blocks: 2 },
  10: { totalCw: 346, ecPerBlock: 18, blocks: 4 },
  11: { totalCw: 404, ecPerBlock: 20, blocks: 4 },
  12: { totalCw: 466, ecPerBlock: 24, blocks: 4 },
  13: { totalCw: 532, ecPerBlock: 26, blocks: 4 },
  14: { totalCw: 581, ecPerBlock: 30, blocks: 4 },
  15: { totalCw: 655, ecPerBlock: 22, blocks: 6 },
  16: { totalCw: 733, ecPerBlock: 24, blocks: 6 },
  17: { totalCw: 815, ecPerBlock: 28, blocks: 6 },
  18: { totalCw: 901, ecPerBlock: 30, blocks: 6 },
  19: { totalCw: 991, ecPerBlock: 28, blocks: 7 },
  20: { totalCw: 1085, ecPerBlock: 28, blocks: 8 },
};

function encodeData(data: number[], version: number): number[] {
  const ecInfo = EC_TABLE[version] ?? EC_TABLE[1]!;
  const totalCw = ecInfo.totalCw;
  const ecPerBlock = ecInfo.ecPerBlock;
  const dataCw = totalCw - ecPerBlock * ecInfo.blocks;

  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, data.length, version <= 9 ? 8 : 16);

  for (const byte of data) {
    pushBits(bits, byte, 8);
  }

  const totalDataBits = dataCw * 8;
  pushBits(bits, 0, Math.min(4, totalDataBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(bits, padBytes[padIdx % 2]!, 8);
    padIdx++;
  }

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0);
    }
    dataBytes.push(byte);
  }

  const dataPerBlock = Math.floor(dataCw / ecInfo.blocks);
  const extraBlocks = dataCw % ecInfo.blocks;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  for (let b = 0; b < ecInfo.blocks; b++) {
    const blockSize = dataPerBlock + (b >= ecInfo.blocks - extraBlocks ? 1 : 0);
    const block = dataBytes.slice(offset, offset + blockSize);
    dataBlocks.push(block);
    ecBlocks.push(reedSolomon(block, ecPerBlock));
    offset += blockSize;
  }

  const result: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]!);
    }
  }

  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) {
      if (i < block.length) result.push(block[i]!);
    }
  }

  return result;
}

function pushBits(arr: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i--) {
    arr.push((value >> i) & 1);
  }
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x >= 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function reedSolomon(data: number[], ecLen: number): number[] {
  let gen: number[] = [1];
  for (let i = 0; i < ecLen; i++) {
    const next: number[] = new Array(gen.length + 1).fill(0) as number[];
    for (let j = 0; j < gen.length; j++) {
      next[j] = (next[j] ?? 0) ^ gen[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(gen[j]!, GF_EXP[i]!);
    }
    gen = next;
  }

  const result: number[] = new Array(ecLen).fill(0) as number[];
  const msg = [...data, ...result];

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i]!;
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msg[i + j] = (msg[i + j] ?? 0) ^ gfMul(gen[j]!, coef);
      }
    }
  }

  return msg.slice(data.length);
}

function placeDataBits(
  matrix: (boolean | null)[][],
  reserved: boolean[][],
  data: number[],
  size: number,
) {
  let bitIdx = 0;
  const totalBits = data.length * 8;

  let col = size - 1;
  while (col >= 0) {
    if (col === 6) col--;

    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        if (x < 0 || x >= size) continue;

        const upward = ((size - 1 - col) >> 1) % 2 === 0;
        const actualRow = upward ? size - 1 - row : row;

        if (reserved[actualRow]![x]) continue;

        if (bitIdx < totalBits) {
          const byteIdx = Math.floor(bitIdx / 8);
          const bitPos = 7 - (bitIdx % 8);
          matrix[actualRow]![x] = ((data[byteIdx]! >> bitPos) & 1) === 1;
          bitIdx++;
        } else {
          matrix[actualRow]![x] = false;
        }
      }
    }

    col -= 2;
  }
}

function applyMask(
  matrix: (boolean | null)[][],
  reserved: boolean[][],
  size: number,
) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r]![c] && matrix[r]![c] !== null) {
        if ((r + c) % 2 === 0) {
          matrix[r]![c] = !matrix[r]![c];
        }
      }
    }
  }
}

function placeFormatInfo(matrix: (boolean | null)[][], size: number) {
  const formatBits = 0b111011111000100;

  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;

    if (i < 6) {
      matrix[8]![i] = bit;
    } else if (i < 8) {
      matrix[8]![i + 1] = bit;
    } else if (i < 9) {
      matrix[8 - (i - 8)]![8] = bit;
    } else {
      matrix[14 - i]![8] = bit;
    }

    if (i < 8) {
      matrix[size - 1 - i]![8] = bit;
    } else {
      matrix[8]![size - 15 + i] = bit;
    }
  }
}

function placeVersionInfo(
  matrix: (boolean | null)[][],
  version: number,
  size: number,
) {
  if (version < 7) return;

  const versionInfoTable: Record<number, number> = {
    7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3,
    11: 0x0bbf6, 12: 0x0c762, 13: 0x0d847, 14: 0x0e60d,
    15: 0x0f928, 16: 0x10b78, 17: 0x1145d, 18: 0x12a17,
    19: 0x13532, 20: 0x149a6,
  };

  const info = versionInfoTable[version] ?? 0;
  for (let i = 0; i < 18; i++) {
    const bit = ((info >> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    matrix[r]![size - 11 + c] = bit;
    matrix[size - 11 + c]![r] = bit;
  }
}
