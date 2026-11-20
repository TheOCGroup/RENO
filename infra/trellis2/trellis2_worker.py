"""Commercial-safe TRELLIS.2-4B image-to-3D worker for OCG 3D ENGINE.

Implements the verified upstream microsoft/TRELLIS.2 (75fbf018) pipeline API:
  Trellis2ImageTo3DPipeline.from_pretrained -> pipe.cuda() -> pipe.run(rgba)[0]
  -> o_voxel.postprocess.to_glb(...).export(output_path)

Refuses non-commercial dependencies (briaai/RMBG-2.0, nvdiffrast, nvdiffrec)
unless explicitly licensed or OCG_TEXTURED_GLB_MODE=geometry_only is set.
Never fakes inference when GPU or model weights are unavailable.
"""

import json
import os
import shutil
import sys
import tempfile

APPROVED_BG_REMOVERS = {"u2net", "isnet-general-use"}


def fail(code: str, message: str, exit_code: int = 1) -> None:
    sys.stderr.write(json.dumps({"ok": False, "error": code, "message": message}) + "\n")
    sys.exit(exit_code)


def validate_commercial_env() -> tuple[str, str, bool]:
    bg_remover = os.environ.get("OCG_BG_REMOVER", "u2net").strip()
    bria_ok = os.environ.get("OCG_BRIA_COMMERCIAL_LICENSED", "").lower() == "true"
    nvdiff_ok = os.environ.get("OCG_NVDIFFRAST_COMMERCIAL_LICENSED", "").lower() == "true"
    glb_mode = os.environ.get("OCG_TEXTURED_GLB_MODE", "textured").strip()

    if bg_remover == "briaai/RMBG-2.0" and not bria_ok:
        fail("NONCOMMERCIAL_DEPENDENCY_BLOCKED", "briaai/RMBG-2.0 is blocked in commercial mode.")
    if bg_remover not in APPROVED_BG_REMOVERS and not (bg_remover == "briaai/RMBG-2.0" and bria_ok):
        fail("UNAPPROVED_BG_REMOVER", f"Unsupported background remover: {bg_remover}")

    if glb_mode != "geometry_only" and not nvdiff_ok:
        fail(
            "NONCOMMERCIAL_DEPENDENCY_BLOCKED",
            "o_voxel.postprocess.to_glb requires nvdiffrast (NVIDIA Non-Commercial) unless "
            "OCG_NVDIFFRAST_COMMERCIAL_LICENSED=true or OCG_TEXTURED_GLB_MODE=geometry_only.",
        )

    if os.environ.get("OCG_DINOV3_ATTRIBUTION", "").strip() != "Built with DINOv3":
        fail("ATTRIBUTION_REQUIRED", "OCG_DINOV3_ATTRIBUTION must be set to 'Built with DINOv3'.")

    return bg_remover, glb_mode, nvdiff_ok


def main() -> None:
    if len(sys.argv) < 3:
        fail("INVALID_ARGS", "Usage: trellis2_worker.py <input_image_path> <output_glb_path>", 2)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    bg_remover, glb_mode, nvdiff_ok = validate_commercial_env()

    try:
        import torch  # type: ignore
    except ImportError:
        fail("TORCH_UNAVAILABLE", "PyTorch with CUDA is not installed on this host.")

    if not torch.cuda.is_available():
        fail("GPU_UNAVAILABLE", "NVIDIA CUDA GPU is required for TRELLIS.2-4B inference.")

    cache_dir = os.environ.get("OCG_TRELLIS_LOCAL_CACHE_DIR", "").strip()
    if not cache_dir or not os.path.isdir(cache_dir) or not os.path.isfile(os.path.join(cache_dir, "pipeline.json")):
        fail("WEIGHTS_NOT_CACHED", "OCG_TRELLIS_LOCAL_CACHE_DIR must point to locally cached TRELLIS.2-4B weights containing pipeline.json.")

    tmp_dir = tempfile.mkdtemp(prefix="ocg-trellis2-")
    try:
        from PIL import Image  # type: ignore
        from rembg import remove, new_session  # type: ignore

        with Image.open(input_path) as img:
            rgba = remove(img.convert("RGBA"), session=new_session(bg_remover))
            prepped_path = os.path.join(tmp_dir, "input_rgba.png")
            rgba.save(prepped_path, format="PNG")

        from trellis2.pipelines import Trellis2ImageTo3DPipeline  # type: ignore

        pipe = Trellis2ImageTo3DPipeline.from_pretrained(cache_dir)
        if os.environ.get("OCG_BRIA_COMMERCIAL_LICENSED", "").lower() != "true":
            pipe.rembg_model = None
        pipe.cuda()
        with Image.open(prepped_path) as prepped_img:
            mesh = pipe.run(prepped_img, preprocess_image=True)[0]

        if glb_mode == "geometry_only":
            import trimesh  # type: ignore

            verts = mesh.vertices.detach().cpu().numpy()
            faces = mesh.faces.detach().cpu().numpy()
            if len(verts) == 0 or len(faces) == 0:
                fail("EMPTY_MESH_OUTPUT", "TRELLIS.2 pipeline produced zero vertices or faces.")
            tri_mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
            tri_mesh.export(output_path)
        else:
            if not nvdiff_ok:
                fail("NONCOMMERCIAL_DEPENDENCY_BLOCKED", "nvdiffrast commercial license required for textured GLB export.")
            import o_voxel  # type: ignore

            glb = o_voxel.postprocess.to_glb(
                vertices=mesh.vertices,
                faces=mesh.faces,
                attr_volume=mesh.attrs,
                coords=mesh.coords,
                attr_layout=mesh.layout,
                voxel_size=mesh.voxel_size,
                aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
                decimation_target=1000000,
                texture_size=2048,
                remesh=True,
                remesh_band=1,
            )
            glb.export(output_path)

        sys.stdout.write(json.dumps({"ok": True, "bgRemover": bg_remover, "glbMode": glb_mode, "outputPath": output_path}) + "\n")
    except Exception as exc:
        fail("INFERENCE_FAILED", str(exc))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
