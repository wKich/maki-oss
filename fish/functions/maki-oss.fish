function maki-oss --description 'Run Maki in an OpenShell sandbox'
    # Thin wrapper around bin/maki-oss. Resolution order:
    #   1. $MAKI_OSS_BIN (explicit override)
    #   2. the source repository, when this function is symlinked from it
    #   3. maki-oss on PATH
    set -l bin $MAKI_OSS_BIN

    if test -z "$bin"
        set -l self (status --current-filename)
        if test -n "$self"
            set -l resolved (path resolve $self 2>/dev/null)
            set -l candidate (path resolve (path dirname $resolved)/../../bin/maki-oss 2>/dev/null)
            if test -x "$candidate"
                set bin $candidate
            end
        end
    end

    if test -z "$bin"
        set bin (command -s maki-oss)
    end

    if test -z "$bin"; or not test -x "$bin"
        echo "maki-oss: cannot locate bin/maki-oss; set MAKI_OSS_BIN to its path" >&2
        return 127
    end

    command $bin $argv
    return $status
end
