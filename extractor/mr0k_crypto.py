### INIT ###

from mr0k_keys import CryptoKeys as CryptoKeysInit
CryptoKeys = CryptoKeysInit()

### MR0K ###

def decryptMr0k(data):
	key1 = bytearray(data[4:20])
	key2 = bytearray(data[116:132])
	key3 = bytearray(data[132:148])

	encryptedBlockSize = min(16 * ((len(data) - 148) >> 7), 1024)
	print(f"Encrypted block size : {encryptedBlockSize}")

	for i in range(len(CryptoKeys.Mr0kInitVector)):
		key2[i] ^= CryptoKeys.Mr0kInitVector[i]

	key1 = bytearray(AESDecrypt(key1, CryptoKeys.Mr0kExpansionKey))
	key3 = bytearray(AESDecrypt(key3, CryptoKeys.Mr0kExpansionKey))

	for i in range(len(key1)):
		key1[i] ^= key3[i]

	# skip bh3 key2 xor

	data[132:148] = key1

	seed1 = int.from_bytes(key2[:8], "little")
	seed2 = int.from_bytes(key3[:8], "little")
	seed = seed2 ^ seed1 ^ (seed1 + len(data) - 20)

	print(f"Seed : {hex(seed)}")

	encryptedBlock = bytearray(data[148:encryptedBlockSize+148])
	seed = seed.to_bytes((seed.bit_length() + 7) // 8, "little")

	for i in range(encryptedBlockSize):
		encryptedBlock[i] ^= seed[i % len(seed)] ^ CryptoKeys.Mr0kBlockKey[i % len(CryptoKeys.Mr0kBlockKey)]

	data[148:encryptedBlockSize+148] = encryptedBlock
	data = data[20:]

	return data

### BLB ###

def decryptBlb(header, buffer):
	buffer = buffer[:min(128, len(buffer))]

	for i in range(len(header)):
		buffer[i] ^= header[i]

	buffer[:16] = AESEncrypt(buffer[:16], header)

	if len(buffer) > 16:
		RC4(buffer)

	buffer[:16] = descramble(buffer[:16])

	return buffer

### SCRAMBLE ###

def descramble(buf):
	GF256Mul = lambda a, b: 0 if a == 0 or b == 0 else CryptoKeys.GF256Exp[(CryptoKeys.GF256Log[a] + CryptoKeys.GF256Log[b]) % 0xFF]

	vector = bytearray(len(buf))
	for i in range(3):
		for j in range(len(buf)):
			k = CryptoKeys.BlbShiftRow[(2 - i) * 16 + j]
			idx = j % 8
			vector[j] = CryptoKeys.BlbKey[idx] ^ CryptoKeys.BlbSBox[(j % 4 * 0x100) | GF256Mul(CryptoKeys.BlbMul[idx], buf[k % len(buf)])]
		buf[:] = vector

	return buf

### RC4 ###

def RC4(buf):
	S = CryptoKeys.BlbRC4Key[:]
	T = [0] * 256
	for i in range(0, 256, 2):
		T[i] = buf[i & 6]
		T[i + 1] = buf[(i + 1) & 7]

	j = 0
	for i in range(256):
		j = (j + S[i] + T[i]) % 256
		S[i], S[j] = S[j], S[i]

	i = j = 0
	for iteration in range(len(buf) - 16):
		i = (i + 1) % 256
		j = (j + S[i]) % 256
		S[i], S[j] = S[j], S[i]
		K = S[(S[j] + S[i]) % 256]
		idx = (i % 8) + 8
		if buf[idx] % 3 == 0:
			buf[iteration + 16] ^= K
		elif buf[idx] % 3 == 1:
			buf[iteration + 16] = (buf[iteration + 16] - K) % 256
		else:
			buf[iteration + 16] = (buf[iteration + 16] + K) % 256

### AES ###
def AESDecrypt(m, k):
	# normal AES
	c = bytearray(m[:16])
	c = xorRoundKey(c, k, 0)

	for i in range(9):
		c = subBytesInv(c)
		c = shiftRowsInv(c)
		c = mixColsInv(c)
		c = xorRoundKey(c, k, i + 1)

	c = subBytesInv(c)
	c = shiftRowsInv(c)
	c = xorRoundKey(c, k, 10)

	return bytes(c)

def mixColsInv(state):
	for off in (0, 4, 8, 12):
		state = mixColInv(state, off)
	return state

def mixColInv(state, off):
	a0, a1, a2, a3 = state[off:off+4]
	state[off + 0] = CryptoKeys.AESLookupG14[a0] ^ CryptoKeys.AESLookupG9[a3] ^ CryptoKeys.AESLookupG13[a2] ^ CryptoKeys.AESLookupG11[a1]
	state[off + 1] = CryptoKeys.AESLookupG14[a1] ^ CryptoKeys.AESLookupG9[a0] ^ CryptoKeys.AESLookupG13[a3] ^ CryptoKeys.AESLookupG11[a2]
	state[off + 2] = CryptoKeys.AESLookupG14[a2] ^ CryptoKeys.AESLookupG9[a1] ^ CryptoKeys.AESLookupG13[a0] ^ CryptoKeys.AESLookupG11[a3]
	state[off + 3] = CryptoKeys.AESLookupG14[a3] ^ CryptoKeys.AESLookupG9[a2] ^ CryptoKeys.AESLookupG13[a1] ^ CryptoKeys.AESLookupG11[a0]
	return state

def shiftRowsInv(state):
	temp = state[:]
	return bytearray(temp[CryptoKeys.AESShiftRowsTableInv[i]] for i in range(16))

def subBytesInv(a):
	return bytearray(CryptoKeys.AESLookupSBoxInv[b] for b in a)

def xorRoundKey(state, keys, round):
	return bytearray(state[i] ^ keys[i + round * 16] for i in range(16))

# BLB 3 VERSION

def AESEncrypt(m, k):
	# used by Blb3
	keys = expand(k)

	c = bytearray(m[:16])
	c = blbXorRoundKey(c, keys, 0)

	#
	subBytes = lambda a: bytearray(a[i] ^ CryptoKeys.BlbAESSBox[a[i]] for i in range(len(a)))
	shiftRows = lambda state: bytearray(state[CryptoKeys.AESShiftRowsTable[i]] for i in range(16))
	#

	for i in range(9):
		c = subBytes(c)
		c = shiftRows(c)
		c = mixCols(c)
		c = blbXorRoundKey(c, keys, i + 1)

	c = subBytes(c)
	c = shiftRows(c)
	c = blbXorRoundKey(c, keys, 10)

	return bytes(c)

def expand(key):
	keys = bytearray(176)

	for i in range(16):
		keys[i] = key[CryptoKeys.BlbAESShift[i]]

	offset = 0x1f
	for round in range(10):
		a = CryptoKeys.BlbAESSBox[keys[offset - 0x14]]
		b = CryptoKeys.BlbAESSBox[keys[offset - 0x10]]
		c = CryptoKeys.BlbAESSBox[keys[offset - 0x18]] ^ keys[offset - 0x18] ^ CryptoKeys.AESPowerSchedule[round] ^ keys[offset - 0x1f]
		d = CryptoKeys.BlbAESSBox[keys[offset - 0x1c]]
		temp = 0

		keys[offset - 0xf] = c
		temp = a ^ keys[offset - 0x14] ^ keys[offset - 0x1b]
		keys[offset - 0xb] = temp
		a = b ^ keys[offset - 0x10] ^ keys[offset - 0x17]
		keys[offset - 7] = a
		b = d ^ keys[offset - 0x1c] ^ keys[offset - 0x13]
		keys[offset - 3] = b
		c = c ^ keys[offset - 0x1e]
		keys[offset - 0xe] = c
		temp = temp ^ keys[offset - 0x1a]
		keys[offset - 10] = temp
		a = a ^ keys[offset - 0x16]
		keys[offset - 6] = a
		b = b ^ keys[offset - 0x12]
		keys[offset - 2] = b
		c = c ^ keys[offset - 0x1d]
		keys[offset - 0xd] = c
		temp = temp ^ keys[offset - 0x19]
		keys[offset - 9] = temp
		a = a ^ keys[offset - 0x15]
		keys[offset - 5] = a
		b = b ^ keys[offset - 0x11]
		keys[offset - 1] = b
		keys[offset - 0xc] = c ^ keys[offset - 0x1c]
		keys[offset - 8] = temp ^ keys[offset - 0x18]
		keys[offset - 4] = a ^ keys[offset - 0x14]
		keys[offset] = b ^ keys[offset - 0x10]

		offset += 0x10

	return bytes(keys)

def blbXorRoundKey(state, keys, round):
	new_state = bytearray(16)
	for i in range(4):
		for j in range(4):
			new_state[i * 4 + j] = state[i * 4 + j] ^ keys[i + j * 4 + round * 16]
	return new_state

def mixCol(state, off):
	a0, a1, a2, a3 = state[off:off+4]
	state[off + 0] = CryptoKeys.AESLookupG2[a0] ^ CryptoKeys.AESLookupG3[a1] ^ a2 ^ a3
	state[off + 1] = CryptoKeys.AESLookupG2[a1] ^ CryptoKeys.AESLookupG3[a2] ^ a3 ^ a0
	state[off + 2] = CryptoKeys.AESLookupG2[a2] ^ CryptoKeys.AESLookupG3[a3] ^ a0 ^ a1
	state[off + 3] = CryptoKeys.AESLookupG2[a3] ^ CryptoKeys.AESLookupG3[a0] ^ a1 ^ a2
	return state

def mixCols(state):
	for off in (0, 4, 8, 12):
		state = mixCol(state, off)
	return state
