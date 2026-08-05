# Docker env file: multi-line values not supported

## Error you might see

```text
docker: invalid env file (/home/ubuntu/.env): variable '-----END RSA PRIVATE KEY-----' contains whitespaces
```

or

```text
docker: invalid env file (...): variable '...' contains whitespaces
```

## Cause

`docker run --env-file /path/to/.env` only supports **one variable per line**. The value is everything after the first `=`. So:

- **Multi-line values** (e.g. RSA keys) break: Docker treats the next line as a **new variable name**, which can contain invalid characters and cause this error.
- **Any variable whose value is split across lines** will also break (e.g. `ENCRYPTION_KEY` split on two lines).

## Fix on EC2

Edit `/home/ubuntu/.env` so that **every variable is on a single line**.

### 1. ENCRYPTION_KEY (single line)

If it’s split across two lines, merge into one:

```env
# Wrong (Docker will treat the second line as a variable name):
ENCRYPTION_KEY=eddc02017a065850f521130c9e460eaacbe890f0253af
eb708058753b4217bf5

# Correct:
ENCRYPTION_KEY=eddc02017a065850f521130c9e460eaacbe890f0253afeb708058753b4217bf5
```

### 2. DOCUSIGN_PRIVATE_KEY and DOCUSIGN_PUBLIC_KEY (single line with `\n`)

Put the whole key on one line and use the two characters **backslash + n** (`\n`) where you would have a newline. The app will treat `\n` as a newline when using the key.

**Wrong (multi-line in file):**

```env
DOCUSIGN_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAtd6Fmax2wP6ga9G0PeMk...
-----END RSA PRIVATE KEY-----
```

**Correct (single line, `\n` for newlines):**

```env
DOCUSIGN_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAtd6Fmax2wP6ga9G0PeMk...\n-----END RSA PRIVATE KEY-----"
```

Do the same for `DOCUSIGN_PUBLIC_KEY` and any other multi-line value.

**How to convert:**

- Copy the key (including `-----BEGIN ...-----` and `-----END ...-----`).
- In a text editor, replace each real newline with the two characters `\n`.
- Put the result in quotes on a single line: `DOCUSIGN_PRIVATE_KEY="...\n...\n..."`.

### 3. Optional: verify no multi-line vars

On EC2:

```bash
# Lines that don't contain '=' are treated as variable names and break Docker
grep -n '=' /home/ubuntu/.env
```

Every line in the file should contain exactly `KEY=VALUE` (or `KEY="VALUE"`). No line should be only part of a key (e.g. a continuation of an RSA key).

## After editing

1. Save `/home/ubuntu/.env`.
2. Re-run your deploy (or start the container again):

   ```bash
   docker run -d -p 4000:4000 --env-file /home/ubuntu/.env --name backend backend
   ```

## Reference

- Docker only supports one variable per line: <https://docs.docker.com/compose/environment-variables/#env-file>
- Your deploy uses: `--env-file /home/ubuntu/.env` (see `.github/workflows/deploy-ec2.yml`).
