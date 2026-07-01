import { ImageBackground, Pressable, StyleSheet, Text } from 'react-native';
import { useState } from 'react';
import { View, TextInput, Button} from 'react-native';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <ImageBackground
      // Setting up the background
      source={require('@/assets/images/background.png')}
      style={styles.background}
      resizeMode="contain"
    >
    
        <Pressable
        onPress={() => { 
          router.push('/new_user')
        }}
        style={{
          padding: 12,
          backgroundColor: 'black',
          marginTop: 10,
        }}
        >
        <Text style={{ color: 'white' }}>New User? Sign Up!</Text>
      </Pressable>

      {/* Adding a back button*/}
      <Pressable
        onPress={() => { 
          router.push('/')
        }}
        style={{
          padding: 12,
          backgroundColor: 'black',
          marginTop: 10,
        }}
        >
        <Text style={{ color: 'white' }}>Back</Text>
      </Pressable>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 36,
    color: 'white',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#fff',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
});