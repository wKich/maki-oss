-- Baked global Maki configuration for the OpenShell sandbox image.
--
-- This is the sandbox user's global config (~/.config/maki/init.lua).
-- OpenShell, not Maki, is the security boundary: filesystem, network, and
-- process policy are enforced outside this process. These settings only make
-- unattended sandbox runs work without interactive prompts.
maki.setup({
    -- Start every session with YOLO mode so headless runs never block on a
    -- permission prompt. Explicit deny rules in permissions.toml still apply.
    always_yolo = true,

    -- Pre-answer folder trust for projects placed under /sandbox. Without
    -- this, headless runs skip a project's .maki configuration and report
    -- the skipped path on stderr. `prompt = false` also drops the trust card
    -- for interactive use in the image.
    trust = {
        paths = { "/sandbox", "/sandbox/**" },
        prompt = false,
    },
})
