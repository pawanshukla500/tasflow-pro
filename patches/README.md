# Patches

Place third-party or exported patch files here before applying.

## full-feature.patch

Expected path (local Windows):

```
C:\Users\shukl\Desktop\full-feature.patch
```

### Apply in Cloud Shell

```bash
cd ~/tasflow-pro
git pull origin main
mkdir -p patches

# Upload from your PC (run in local terminal with gcloud):
# gcloud cloud-shell scp localhost:"C:/Users/shukl/Desktop/full-feature.patch" \
#   cloudshell:~/tasflow-pro/patches/full-feature.patch

bash scripts/apply-full-feature-patch.sh
npm test -- --run
npm run build
git checkout -b cursor/integrate-full-feature-ddfd
git add -A
git commit -m "Integrate full-feature.patch"
git push -u origin cursor/integrate-full-feature-ddfd
```

GitHub Actions will auto-deploy after merge to `main`.
