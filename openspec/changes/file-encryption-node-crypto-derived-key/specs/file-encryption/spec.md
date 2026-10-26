# Spec Delta

## Purpose

Defines how the API encrypts files before putting them on public storage (IPFS), and how the file-retrieval worker returns them decrypted, so that files stay unreadable at rest and files from every format version keep decrypting.

## ADDED Requirements

### Requirement: New files are encrypted with a derived key
The API SHALL encrypt every file it stores on public storage with AES-256-CTR. It SHALL use a fresh random 16-byte IV per file and a 32-byte key derived with HKDF-SHA256 from the configured encryption password and salt. It SHALL NOT use the salt or its plain hash as the key.

#### Scenario: New file round-trips
- **WHEN** a file is encrypted with the configured password and salt
- **THEN** the stored bytes differ from the original
- **AND** decrypting them with the same password and salt returns the original bytes exactly

#### Scenario: Legacy key cannot read new files
- **WHEN** a newly encrypted file is decrypted with the legacy key `sha256(salt)`
- **THEN** the result does not equal the original bytes

#### Scenario: Same file encrypts differently each time
- **WHEN** the same file is encrypted twice
- **THEN** the two ciphertexts differ

### Requirement: New ciphertext carries a version marker
Each newly encrypted file SHALL start with the fixed 8-byte ASCII marker `PLNENC02`, then the 16-byte IV, then the ciphertext. Legacy files have no marker: they are the 16-byte IV followed by the ciphertext.

#### Scenario: Marker present on new files
- **WHEN** a file is encrypted
- **THEN** its first 8 bytes are `PLNENC02` and the next 16 bytes are the IV

### Requirement: Encryption fails closed without secrets
The API SHALL refuse to encrypt, with an error, when the encryption password or salt is missing or empty. It SHALL NOT store the file unencrypted, and SHALL NOT encrypt it with the legacy key.

#### Scenario: Missing password
- **WHEN** a file is encrypted and the encryption password is not configured
- **THEN** encryption throws an error and returns no file

#### Scenario: S3 uploads unaffected
- **WHEN** file storage is S3 and the encryption password is not configured
- **THEN** uploads succeed exactly as before, because S3 uploads are not encrypted by this capability

### Requirement: Retrieval decrypts current and legacy files
The file-retrieval worker SHALL decrypt a file that starts with the `PLNENC02` marker using the derived key. It SHALL decrypt any other file with the legacy layout and legacy key (`sha256(salt)`, AES-256-CTR), so files stored before this change still decrypt.

#### Scenario: New file served decrypted
- **WHEN** the worker fetches a file that starts with `PLNENC02`
- **THEN** it responds 200 with the original bytes

#### Scenario: Legacy file still served decrypted
- **WHEN** the worker fetches a file encrypted before this change
- **THEN** it responds 200 with the original bytes, identical to the response before this change
