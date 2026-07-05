{
  description = "QDesigner Modern dev toolchain";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [
      "aarch64-darwin"
      "x86_64-darwin"
      "x86_64-linux"
    ] (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            pkgs.pnpm_8
            pkgs.rustc
            pkgs.cargo
            pkgs.rustfmt
            pkgs.clippy
            pkgs.cargo-watch
            # sqlx offline-macro tooling: `cargo sqlx prepare` regenerates the
            # committed apps/server/.sqlx/ query cache that lets the query!/
            # query_as! macros expand with the database down (ADR 0024).
            pkgs.sqlx-cli
            pkgs.just
            pkgs.pkg-config
            pkgs.openssl
            # Browser tooling for end-to-end / live UI QA (Playwright + agent-browser
            # drive this chromium; declared here so the flake is self-contained).
            pkgs.chromium
            pkgs.playwright-driver.browsers
          ];
          shellHook = ''
            export CHROME="${pkgs.chromium}/bin/chromium"
            export CHROME_PATH="${pkgs.chromium}/bin/chromium"
            export PUPPETEER_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
          '';
        };
      });
}
