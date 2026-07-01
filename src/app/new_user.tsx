import { ImageBackground, Pressable, StyleSheet, Text, Image, Alert } from 'react-native';
import { useState } from 'react';
import { View, TextInput, Button } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'   // ✅ ADDED

export default function NewUserScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile_pic, setImage] = useState<string | null>(null);

  // ✅ ADDED (Supabase uses email, so we map username → email)
  const handleSignUp = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      Alert.alert('Signup failed', error.message)
      return
    }

    Alert.alert('Success', 'Check your email to confirm signup')
    console.log('User:', data.user)

    // optional navigation after signup
    router.push('/home_page')
  }

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      alert("Permission needed to access photos.")
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  }

  return (
    <ImageBackground
      source={require('@/assets/images/background.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.4)',
        }}
      />

      <View style={styles.container}>
        <Text
          style={{
            fontFamily: 'Euphoria',
            fontSize: 50,
            fontWeight: 'bold',
            color: '#4d4139',
            marginBottom: 20,
          }}
        >
          Create an Account
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
        />

        {/* ✅ CHANGED: now actually calls Supabase */}
        <Pressable
          onPress={handleSignUp}
          style={[styles.button, { backgroundColor: '#977d6d' }]}
        >
          <Text style={[styles.buttonText, { color: 'white' }]}>
            Next
          </Text>
        </Pressable>

      </View>
    </ImageBackground>
  );
}


const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginTop: 15,
    fontSize: 16,
    backgroundColor: 'white',
  },

  button: {
    padding: 12,
    backgroundColor: 'black',
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
    borderRadius: 10,
  },

  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});