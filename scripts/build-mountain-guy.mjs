// Builds public/models/mountain-guy.glb from the Hyper3D export in src/models/mountain-guy/
// (base.obj + texture_diffuse/roughness/metallic/normal.png; shaded.png and texture_pbr.png unused).
//
// The tools are not project dependencies (sharp is native and heavy). Run from a scratch folder:
//   npm i --no-save obj2gltf@3.2.0 @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
//     @gltf-transform/functions@4.5.1 meshoptimizer sharp
//   node <repo>/scripts/build-mountain-guy.mjs <repo>/src/models/mountain-guy <repo>/public/models/mountain-guy.glb
//
// Steps: OBJ -> glTF (obj2gltf), weld, simplify to ~5k triangles (meshoptimizer, Permissive mode:
// the Hyper3D UV atlas has seams everywhere and locks the plain simplifier at ~84k), one PBR
// material (base colour sRGB; roughness -> G and metallic -> B of one linear map; normal map),
// textures 1024 px WebP, quantize + meshopt compression (decoder ships with three, no CDN fetch).
import { createRequire } from 'node:module'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, simplify, prune, dedup, reorder, quantize, meshopt, textureCompress, getBounds } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'

const require = createRequire(path.join(process.cwd(), 'x.js'))
const obj2gltf = require('obj2gltf')
const [, , dir, output, ratioArg = '0.01', errArg = '0.05'] = process.argv
const SIZE = 1024

await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready])
const PERMISSIVE = new Proxy(MeshoptSimplifier, { get: (t, k) => (k === 'simplify' ? (i, p, st, n, e, f = []) => t.simplify(i, p, st, n, e, [...f, 'Permissive']) : t[k]) })
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

const doc = await io.readBinary(new Uint8Array(await obj2gltf(path.join(dir, 'base.obj'), { binary: true })))
const prims = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
const tris = () => prims().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0)
console.log('triangles in :', tris())
await doc.transform(weld(), simplify({ simplifier: PERMISSIVE, ratio: Number(ratioArg), error: Number(errArg) }))
console.log('triangles out:', tris())

const tex = (name, buf) => doc.createTexture(name).setImage(new Uint8Array(buf)).setMimeType('image/png')
const scaled = (f) => sharp(path.join(dir, f)).resize(SIZE, SIZE)
const rough = await scaled('texture_roughness.png').extractChannel(0).raw().toBuffer()
const metal = await scaled('texture_metallic.png').extractChannel(0).raw().toBuffer()
const mr = Buffer.alloc(SIZE * SIZE * 3)
for (let i = 0; i < SIZE * SIZE; i++) { mr[i * 3] = 255; mr[i * 3 + 1] = rough[i]; mr[i * 3 + 2] = metal[i] }
for (const m of doc.getRoot().listMaterials()) m.dispose()
const mat = doc.createMaterial('mountain-guy')
  .setBaseColorTexture(tex('baseColor', await scaled('texture_diffuse.png').png().toBuffer()))
  .setMetallicRoughnessTexture(tex('metallicRoughness', await sharp(mr, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer()))
  .setMetallicFactor(1).setRoughnessFactor(1)
  .setNormalTexture(tex('normal', await scaled('texture_normal.png').png().toBuffer()))
for (const p of prims()) p.setMaterial(mat)

await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }), reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
console.log('bounds:', JSON.stringify(getBounds(doc.getRoot().listScenes()[0])))
await io.write(output, doc)
