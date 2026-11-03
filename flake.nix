{
  description = "manj.io: Astro site, Slidev decks, and the Void app that serves them";

  inputs.nixpkgs.url = "https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.xz";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          # Void requires Node.js ^24.22.0 || >=26.12.0.
          nodejs = pkgs.nodejs_26;
          pnpm = pkgs.pnpm_10.override { nodejs-slim = pkgs.nodejs-slim_26; };
          # scripts/subset-fonts.mjs runs pyftsubset with WOFF2 output.
          python = pkgs.python3.withPackages (ps: [
            ps.fonttools
            ps.brotli
            ps.zopfli
          ]);
        in
        {
          default = pkgs.mkShell {
            packages = [
              nodejs
              pnpm
              python
              pkgs.sqlite
            ];
          };
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
