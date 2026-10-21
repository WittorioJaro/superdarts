# Camera scoring core

All modules are framework-free TypeScript. No score is submitted by this library. The iPad must ask the player to confirm a visit, and use distinct suggestions as one-tap corrections.

Coordinates: `{x,y}` in board units, origin at bull, x right, **y down**. One unit = outer double radius = 170 mm. Angles start at 20 (up) and increase clockwise. `Dart` uses the existing `s,m` representation, including `{s:25,m:2}` bull and `{s:0,m:0}` miss. Wire positions have zero probability mass; this is a model of beds, not physical wire bounce-outs.

## Public API

Import directly from each module under `@/lib/vision/`.

### homography.ts

- `Point {x:number; y:number}`; `BoardPoint = Point`.
- `Homography = [number,number,number,number,number,number,number,number,number]`: row-major 3×3 matrix, JSON-safe.
- `homography(from: readonly Point[], to: readonly Point[]): Homography`: Hartley-normalized DLT for at least four pairs; least-squares fit for extra pairs. Throws for deficient/non-finite inputs.
- `apply(h: Homography, p: Point): Point`: project a point; throws at the projective horizon.
- `invert(h: Homography): Homography`: invert, rejecting singular matrices.
- `multiply(a: Homography, b: Homography): Homography`: compose as `a(b(p))`.

### calibration.ts

- `ImageSize {width:number; height:number}`.
- `CalibrationPoints {top:Point; right:Point; bottom:Point; left:Point; bull?:Point}`: original video pixels, not CSS/display pixels.
- `CALIBRATION_POINTS`: canonical board points: top `(0,-1)` on **20**, right `(1,0)` on **6**, bottom `(0,1)` on **3**, left `(-1,0)` on **11**, bull `(0,0)`. All four required taps are the **outer double wire**, at the sector centre.
- `createCalibration(imagePoints: CalibrationPoints, imageSize: ImageSize): Calibration`: validates convexity, area, horizon and reprojection error. Throws `CalibrationError` with a user-displayable `reason`. Mirrored input is supported when taps identify the correct numbers.
- `Calibration {version:1; imageSize; imagePoints; imageToBoard; boardToImage; quality:{rmsPixels;maxPixels;areaFraction;warnings:string[]}}`: plain JSON. Four taps fit exactly, so their zero RMS alone is not evidence of accuracy; the optional bull adds a consistency check.
- `restoreCalibration(value: unknown): Calibration | null`: checks the version and rebuilds from persisted taps rather than trusting persisted matrices. Parse localStorage JSON in a try/catch before calling.
- `overlayGeometry(calibration: Calibration, samples=120): {rings:Point[][];wires:Point[][]}`: six closed ring polylines and twenty radial wire polylines in original video pixels. Transform to displayed-video coordinates for rendering.

### score.ts

- `scoreAt(p: BoardPoint): Dart`: exact bed lookup with regulation `RINGS` and `BOARD_ORDER`. Radial ties include bull / treble / double; angular ties go clockwise.
- `Covariance {xx:number;xy:number;yy:number}`: symmetric positive semidefinite covariance in squared board units.
- `Candidate {dart:Dart;p:number}`.
- `scoreDistribution(p: BoardPoint, sigma: number | Covariance, opts?: {samples?:number}): Candidate[]`: sorted normalized probabilities, merging identical scores. Numeric sigma is a standard deviation in board units. Deterministic product Gaussian quadrature, default 16×16, truncated at ±4 standard deviations and renormalized. `samples` accepts 4–64; zero sigma is supported.
- `neighbours(dart: Dart): Dart[]`: deterministic alternatives: same number's other rings, anticlockwise/clockwise adjacent numbers in the same ring, then bull or miss. Bull and miss have dedicated alternatives.
- `topSuggestions(dist: readonly Candidate[], k=6): Candidate[]`: returns exactly k distinct scores (1–63), preserving probability order and padding via neighbours at `p:0`. Padded entries are alternatives, not posterior probability estimates. Top-k probabilities may sum to less than one; do not renormalize before sending.

### luma.ts

- `RgbaFrame {data:ArrayLike<number>;width:number;height:number}`: accepts browser `ImageData`.
- `LumaFrame {data:Uint8Array;width:number;height:number}`.
- `new LumaProcessor(targetWidth=320)`: reusable RGBA luminance downscaler with a separable 3×3 box blur. `process(source: RgbaFrame): LumaFrame` overwrites `.frame` on each call; buffers are reused until dimensions change. Width never upscales.
- `rgbaToLuma(source: RgbaFrame, targetWidth=320, reuse?:LumaProcessor): LumaFrame`: convenience wrapper; pass a matching processor for allocation-free reuse.
- `new BoardRectifier(calibration: Calibration, sourceSize=calibration.imageSize, size=256, extent=1.2)`: precomputes bilinear sampling from luma source to square board coordinates `[-extent,+extent]`. `sourceSize` is the actual downscaled luma size. `process(source: LumaFrame): LumaFrame` reuses `.frame`. Outside-source pixels become zero. `.frameToBoard` and `.frameToImage` are transforms for the detector and original-video overlays.

### detector.ts

- `DetectorState = "waiting" | "watching" | "motion" | "settling"`.
- `Detector` interface: `readonly state`, `readonly dartsInVisit`, `process(frame:LumaFrame,at:number):DetectorEvent|null`, `reset():void`, `visit():void`. A learned replacement can implement this interface.
- `new DartDetector(options: DetectorOptions)`: `options` has fixed `width,height`, required `frameToBoard:Homography`, optional `frameToImage:Homography` (identity by default), `params:Partial<DetectorParams>`, and `idPrefix:string`. Use a unique camera-session ID prefix to avoid collisions across detector instances/reloads.
- `process(frame: LumaFrame, at: number): DetectorEvent | null`: feed the exact configured resolution and a finite nondecreasing millisecond timestamp (`performance.now()` or epoch milliseconds; use one clock throughout). It retains internal copies, so callers may reuse input storage immediately. Returns at most one event per frame; no callback registration is needed. No per-frame scratch allocations; event objects are allocated only when emitted.
- `DartEvent {kind:"dart";id:string;at:number;board:BoardPoint;imagePoint:Point;sigma:number;confidence:number}`: raw tip prediction, source-image tip, board standard deviation, heuristic confidence. `sigma` is ready for `scoreDistribution`. Confidence is not a calibrated probability.
- Other `DetectorEvent` variants: `{kind:"motion";at}`, `{kind:"takeout";at}`, `{kind:"noise"|"unsure";at;reason:string}`. Noise/unsure are diagnostics, not scoring candidates. Events do not encode themselves as protocol messages.
- `reset(): void`: retake an empty reference after stable frames; caller must ensure the board is empty. Does not reuse event IDs.
- `visit(): void`: expect removal after confirmed visit/turn change; retains the current reference and removal evidence. More than three darts are still detected, with lower confidence.
- `DETECTOR_DEFAULTS`: see tuning table below. Frames are globally brightness-aligned using a robust median, filtered for local coherence, split into connected components, fitted with PCA, and tipped at the narrower extreme. Each settled change becomes the next reference so old darts are excluded from the next diff.

### bias.ts

- `BiasState {version:1;offset:BoardPoint;sigma:number;samples:number}`: plain JSON, scoped to a calibration/camera setup.
- `createBias(): BiasState`: zero offset, initial sigma 0.02.
- `nearestPointInBed(p: BoardPoint, dart: Dart): BoardPoint`: Euclidean projection into the corrected bed, with a tiny interior margin; singles include both annuli.
- `learnCorrection(state: BiasState, predicted: BoardPoint, corrected: Dart, opts?: Partial<typeof BIAS_DEFAULTS>): BiasState`: immutable bounded EMA update. **predicted must be the raw stored detector point**, not the already adjusted displayed point. Call only when a player changes the prediction.
- `applyBias(state: BiasState, p: BoardPoint, sigma=0): {board:BoardPoint;sigma:number}`: adds the learned offset and combines detector/bias standard deviations in quadrature.
- `restoreBias(value: unknown): BiasState | null`: validates persisted version and bounds. Reset the bias when calibration or camera placement changes.
- `BIAS_DEFAULTS`: `alpha:0.15`, `maxStep:0.1`, `maxOffset:0.15`, `minSigma:0.005`, `maxSigma:0.15`. At default alpha a single correction moves the offset by at most 0.015 board units (2.55 mm).

### protocol.ts

- `VISION_TOPIC = "sd-vision"`, `VISION_VERSION = 1`, `MAX_MESSAGE_BYTES = 8192`.
- `visionMessageSchema`: Zod v4 discriminated union; `VisionMessage`, `PhoneMessage`, `IpadMessage` are inferred types.
- `encodeMessage(message: unknown): Uint8Array | null`: validates before JSON/UTF-8 encoding; never throws on bad input.
- `decodeMessage(bytes: Uint8Array): VisionMessage | null`: validates UTF-8, JSON, version, ranges, legal scoring darts, sorted/distinct probabilities and size; never throws on bad input.
- Phone messages: `{v:1,kind:"dart",id,at,board,sigma,candidates:Candidate[]}`, `{v:1,kind:"takeout",at}`, `{v:1,kind:"status",calibrated:boolean,state:DetectorState|"unsure",fps:number}`.
- iPad messages: `{v:1,kind:"correction",id,dart}`, `{v:1,kind:"reset"}`, `{v:1,kind:"visit"}`.

Send reliable LiveKit data messages with `topic:VISION_TOPIC` and the other device's `destinationIdentities`. Receiver must also check the topic, message direction and expected participant identity: schema validation does not authenticate senders. Keep a bounded map of event IDs to raw points on the phone for correction learning; discard stale IDs and duplicate packets. Publish current `.state` in status messages, since the detector doesn't emit every state transition.

## Phone integration sketch

```ts
import { BoardRectifier, LumaProcessor } from "@/lib/vision/luma";
import { DartDetector } from "@/lib/vision/detector";
import { applyBias, createBias, learnCorrection } from "@/lib/vision/bias";
import { scoreDistribution, topSuggestions } from "@/lib/vision/score";
import { encodeMessage } from "@/lib/vision/protocol";

const luma = new LumaProcessor(320);
// Read actual dimensions from luma.process(firstImageData), preserving aspect ratio.
const warp = new BoardRectifier(calibration, lumaSize);
const detector = new DartDetector({
  width: 256, height: 256,
  frameToBoard: warp.frameToBoard, frameToImage: warp.frameToImage,
  idPrefix: cameraSessionId,
});
let bias = createBias();

function onFrame(imageData: ImageData, at: number) {
  const event = detector.process(warp.process(luma.process(imageData)), at);
  if (event?.kind === "dart") {
    rememberRawPoint(event.id, event.board); // Bound this cache; retain through confirmation.
    const prediction = applyBias(bias, event.board, event.sigma);
    return encodeMessage({ v: 1, kind: "dart", id: event.id, at: event.at,
      ...prediction, candidates: topSuggestions(scoreDistribution(prediction.board, prediction.sigma), 6) });
  }
  if (event?.kind === "takeout") return encodeMessage({ v: 1, ...event });
  return null;
}
// After validating correction identity/id, and finding its stored RAW point:
// bias = learnCorrection(bias, rawPoint, correction.dart); persist JSON.stringify(bias).
// reset -> detector.reset(); visit -> detector.visit().
```

For direct downscaled detection instead of rectification, compute `frameToImage = [sourceWidth/frameWidth,0,0,0,sourceHeight/frameHeight,0,0,0,1]` and `frameToBoard = multiply(calibration.imageToBoard, frameToImage)`. Keep CSS crop/letterbox/mirroring transforms out of these video-coordinate matrices. Rebuild preprocessing/detector on resolution, orientation, zoom or calibration changes.

## Detector tuning

Pixel/area defaults target frames about 256–320 px wide. Prefer rectification to make these values independent of perspective. Board values use 170 mm units.

| Parameter | Default | Meaning |
| --- | ---: | --- |
| stableFrames | 4 | Consecutive still frames before reference/diff analysis |
| stableMs | 120 | Minimum still duration, in addition to frame count |
| motionThreshold | 14 | Luma residual considered frame-to-frame motion |
| motionFraction | 0.002 | Fraction of ROI pixels needed to enter motion |
| diffThreshold | 20 | Settled residual versus reference |
| minArea / maxArea | 10 / 900 | Accepted coherent changed pixels |
| minLength | 9 | Minimum major-axis span in pixels |
| minElongation | 2.5 | Minimum PCA major/minor standard deviation ratio |
| largeChangeFraction | 0.06 | Large settled change: takeout if darts existed, otherwise unsure |
| removalFraction | 0.6 | Stored dart pixels restored to empty appearance to infer takeout |
| referenceAlpha | 0.02 | Still-frame EMA for slow lighting drift |
| roiRadius | 1.25 | Radius of board region inspected; includes misses beyond double wire |

A noisier/low-light feed may need larger thresholds and longer settling; tiny distant darts may need smaller minArea/minLength. Increasing thresholds can miss darts. `confidence` and `sigma` incorporate shape residual, end ambiguity, area, outside-board distance and visit context; they require real-camera validation.

## Camera server actions

Existing room pairing remains compatible. `cameraToken(token)` now grants phone data publication in both modes. Existing room tokens omit `k`; solo tokens use `{k:"solo",p:playerId,e:expirySeconds}` and omit `r`. Verification rejects unknown kinds and conflicting claims.

- `soloVideoToken(): Promise<RoomActionResult<{url:string;token:string}>>`: signed-in player joins `superdarts-solo-<playerId>` as the player ID, with microphone/data publication, subscription and own metadata updates.
- `soloCameraLink(): Promise<RoomActionResult<CameraLink>>`: signed-in player creates the same 12-hour signed camera link used by room pairing.
- `cameraToken(token: string): Promise<RoomActionResult<CameraSession>>`: verifies bearer/expiry and player existence for solo; existing room membership/closed-room checks remain for room tokens. Camera identity is `<playerId>:cam`. LiveKit access lasts six hours.
- `CameraSession.roomCode: string | null`: null for solo. Existing camera text has a minimal local-game fallback.

## Validation and performance

`pnpm test` covers DLT round trips/noise/degeneracy, calibration validation/persistence/overlay, every scoring ring and angular boundary, deterministic normalized probability mixtures, padding, bias projection/bounds, protocol failures, luminance/warp reuse, camera grants and legacy/solo tokens. Synthetic detection goes through RGBA → luma → optional perspective rectification, with hand motion, differently oriented tapered darts, successive additions, takeout, exposure shifts and slow drift. Tip error is asserted below 0.025 board units (4.25 mm), with original-image error below 3 px; inferred top score is asserted too.

Quick host CPU benchmark (320×256 input, warmed, synthetic additions/removals; run via `pnpm test -- src/lib/vision/detector.test.ts --reporter=verbose --silent=false`):

- Detector mean **1.30 ms/frame**, p95 **2.17 ms**, settled classification/removal frames **1.49 ms**.
- RGBA downscale/blur **1.28 ms/frame**; 256×256 bilinear rectification **0.43 ms/frame**.
- 16×16 score distribution **0.063 ms/prediction**.

These are Node host timings, not measurements on an iPhone, and exclude camera capture/readback, rendering, networking and GC outside the core. The test prints current measurements and uses generous detector bounds to avoid shared-runner timing flakes.

## Limitations

The model assumes a fixed camera, planar board, visible tapered dart silhouette and a genuinely empty initial reference. Stability cannot prove emptiness. Camera shake, hard shadows, exposure clipping, occlusion/overlapping darts, dark darts against dark beds, unusually shaped flights and multiple darts arriving before settling can cause misses or unsure events. Largest isolated component analysis cannot recover a hidden point. A partial takeout below the removal threshold can be ambiguous. Large changes after existing darts may be classified as takeout; the UI should ask for a fresh reference if the camera/board moved. Rectification outside the source image fills zero; keep the whole board and useful dart silhouettes in view.

Tip selection is a classical silhouette heuristic, without trained weights or real-camera accuracy guarantees. Gaussian probabilities and bias learning model uncertainty and systematic offset approximately; a correction identifies a bed, not the actual landing coordinate. Bias is bounded and should be reset after moving/recalibrating. The default quadrature can under-resolve extremely narrow beds for very broad sigmas; use more samples when needed. Player confirmation remains required.
