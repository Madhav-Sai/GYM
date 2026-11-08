# Security

Found a vulnerability in myGym? Please report it **privately**: on this repository open **Security → Report a
vulnerability**. Don't post details in a public issue. Include what you did, what you expected, and what happened.

Things worth knowing:
- Passwords are hashed with scrypt; sessions are signed cookies. Whoop tokens are stored encrypted (AES-256-GCM,
  key derived from `data/secret`).
- Keep `data/` private and backed up. Anyone who can read `data/secret` can read the sealed integration tokens.
