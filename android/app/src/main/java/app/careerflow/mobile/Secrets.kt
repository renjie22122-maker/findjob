package app.careerflow.mobile
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class Secrets(private val context:Context){
 companion object {
  private val keyLock=Any()
  private val cache=object:LinkedHashMap<String,Pair<String,String>>(16,0.75f,true){override fun removeEldestEntry(eldest:MutableMap.MutableEntry<String,Pair<String,String>>?)=size>16}
 }

 private fun key():SecretKey=synchronized(keyLock){val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};if(!store.containsAlias("careerflow-api")){KeyGenerator.getInstance("AES","AndroidKeyStore").apply{init(KeyGenParameterSpec.Builder("careerflow-api",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generateKey()}};store.getKey("careerflow-api",null) as SecretKey}
 fun save(value:String,name:String="key"){val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());context.getSharedPreferences("secrets",0).edit().putString(name,Base64.encodeToString(cipher.iv+cipher.doFinal(value.toByteArray()),Base64.NO_WRAP)).apply()}
 fun read(name:String="key"):String?{val value=context.getSharedPreferences("secrets",0).getString(name,null)?:return null;synchronized(cache){cache[name]?.takeIf{it.first==value}?.let{return it.second}};val bytes=Base64.decode(value,Base64.NO_WRAP);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)));val plain=String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)));synchronized(cache){cache[name]=value to plain};return plain}
}
