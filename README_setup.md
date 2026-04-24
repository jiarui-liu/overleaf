# Overleaf Dev Setup Guide

## Prerequisites

- Docker and Docker Compose installed on your Linux machine
- SSH access to the machine from your local computer

## 0. Install Prerequisites

### tmux

```bash
sudo apt-get install -y tmux
```

Verify: `tmux -V`

### Docker (Ubuntu)

```bash
# Update apt and install dependencies
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker apt repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and plugins
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Allow running Docker without sudo (re-login or run `newgrp docker` to apply)
sudo usermod -aG docker $USER
newgrp docker
```

Verify installation:

```bash
docker --version
docker compose version
```

## 1. Start the Services

```bash
cd /home/ubuntu/overleaf/develop
bin/build
# or try COMPOSE_PARALLEL_LIMIT=1 bin/build
docker build texlive -t texlive-full
bin/up
```

Wait until all containers are running. You can verify with:

```bash
docker compose ps
```

## 2. Fix Upload Directory Permissions

The web container's upload directory needs write permissions:

```bash
docker compose exec --user root web bash -c "mkdir -p /overleaf/services/web/data/uploads && chmod 777 /overleaf/services/web/data/uploads"
```

## 3. Disable Sandboxed Compiles

Sandboxed compiles require Server Pro. Make sure `develop/docker-compose.yml` has:

```yaml
SANDBOXED_COMPILES=false
```

If you changed this after containers were already running, recreate the CLSI container:

```bash
docker compose up -d clsi
```

## 4. Install TeX Live in CLSI Container

The CLSI container does not include TeX Live by default:

```bash
docker compose exec --user root clsi bash -c "apt-get update -qq && apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-lang-european texlive-lang-cjk texlive-lang-all latexmk qpdf"
```

This takes a few minutes. Verify installation:

```bash
docker compose exec clsi bash -c "which latexmk && which pdflatex && which qpdf && echo 'TeX Live installed successfully'"
```

## 5. Fix Filestore Blob Access

The filestore needs access to history-v1 blobs to serve binary files (PDFs, images). Make sure `develop/docker-compose.yml` has the following for the `filestore` service:

```yaml
  filestore:
    build:
      context: ..
      dockerfile: services/filestore/Dockerfile
    env_file:
      - dev.env
    environment:
      BACKEND: fs
      OVERLEAF_EDITOR_PROJECT_BLOBS_BUCKET: "/buckets/project_blobs"
      OVERLEAF_EDITOR_BLOBS_BUCKET: "/buckets/blobs"
    volumes:
      - filestore-public-files:/overleaf/services/filestore/public_files
      - filestore-template-files:/overleaf/services/filestore/template_files
      - filestore-uploads:/overleaf/services/filestore/uploads
      - history-v1-buckets:/buckets
```

If you changed this, recreate the filestore container:

```bash
docker compose up -d filestore
```

## 6. Fix Blob File Path Format

After uploading a project, history-v1 stores blobs with `_` separators (e.g., `550_eaf_..._hash`), but filestore expects `/` directory structure (e.g., `550/eaf/.../hash`). Run this to restructure:

```bash
docker compose exec --user root filestore bash -c '
cd /buckets/project_blobs
for f in *_*; do
  newpath=$(echo "$f" | sed "s/_/\//g")
  dir=$(dirname "$newpath")
  mkdir -p "$dir"
  cp "$f" "$newpath"
done
echo "Done restructuring blob files"
'
```

**Note:** This needs to be re-run each time you upload a new project with binary files.

## 7. Access the Site

The site is publicly accessible at: **http://184.73.127.245**

Alternatively, you can set up an SSH tunnel from your **local machine**:

```bash
ssh -L 8080:localhost:80 <your-user>@<your-linux-machine>
```

Then open `http://localhost:8080` in your browser.

## 8. Create Admin User

Shell into the web container:

```bash
cd /home/ubuntu/overleaf/develop
bin/shell web
```

Inside the container, create an admin user:

```bash
node modules/server-ce-scripts/scripts/create-user.js --admin --email=jiaruiliu999@gmail.com
```

It will print an activation URL like:

```
http://127.0.0.1:3000/user/activate?token=<TOKEN>&user_id=<USER_ID>
```

Replace `127.0.0.1:3000` with `184.73.127.245` (or `localhost:8080` if using SSH tunnel) and open in your browser to set your password:

```
http://184.73.127.245/user/activate?token=<TOKEN>&user_id=<USER_ID>
```

## 9. Clean Compile Cache (If Needed)

If compilation gets stuck with stale state after fixing issues, clean the cache:

```bash
docker compose exec clsi bash -c "rm -rf /overleaf/services/clsi/compiles/*/output.* /overleaf/services/clsi/cache/*"
```

Then recompile in the browser.

## Quick Start (All-in-One)

After `bin/up` finishes and all containers are running, run these commands in order:

```bash
cd /home/ubuntu/overleaf/develop

# Fix upload permissions
docker compose exec --user root web bash -c "mkdir -p /overleaf/services/web/data/uploads && chmod 777 /overleaf/services/web/data/uploads"

# Install TeX Live (takes a few minutes)
docker compose exec --user root clsi bash -c "apt-get update -qq && apt-get install -y texlive-latex-base texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-lang-european texlive-lang-cjk texlive-lang-all latexmk qpdf"

# Create admin user (inside web container)
bin/shell web
# Then run: node modules/server-ce-scripts/scripts/create-user.js --admin --email=jiaruiliu999@gmail.com
# Exit the shell with: exit

# After uploading a project, fix blob paths for figures
docker compose exec --user root filestore bash -c 'cd /buckets/project_blobs && for f in *_*; do newpath=$(echo "$f" | sed "s/_/\//g"); dir=$(dirname "$newpath"); mkdir -p "$dir"; cp "$f" "$newpath"; done && echo "Done"'

# Clean compile cache if needed
docker compose exec clsi bash -c "rm -rf /overleaf/services/clsi/compiles/*/output.* /overleaf/services/clsi/cache/*"
```

Then recompile your project in the browser.


## Check logs

```bash
cd develop/
docker compose logs web
```

## Restart

```bash
cd develop/
docker compose restart web
```