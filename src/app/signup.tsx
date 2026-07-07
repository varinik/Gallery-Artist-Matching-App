import {
  ImageBackground,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"signup" | "verify">("signup");
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert("Signup error", error.message);
      return;
    }

    // move to the "enter code" stage instead of just showing an alert
    setStage("verify");
  };

  const handleVerifyCode = async () => {
    if (!code) {
      Alert.alert("Missing code", "Please enter the code from your email.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    });
    setSubmitting(false);

    if (error) {
      Alert.alert("Verification error", error.message);
      return;
    }

    if (data.session) {
      // session exists now — navigate directly.
      // onAuthStateChange in _layout.tsx will also fire SIGNED_IN,
      // so this is just a slightly faster/more explicit path.
      router.replace("/new_user");
    }
  };

  const handleResendCode = async () => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      Alert.alert("Resend error", error.message);
      return;
    }

    Alert.alert("Code resent", "Check your email for a new code.");
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        {stage === "signup" ? (
          <>
            <Text style={styles.title}>Create Account</Text>

            <TextInput
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <TextInput
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
            />

            <Pressable
              style={styles.button}
              onPress={handleSignup}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Signing Up..." : "Sign Up"}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>

            {/* TEMP DEBUG BUTTON */}
            <Pressable
              onPress={() => router.replace("/new_user")}
              style={styles.backButton}
            >
              <Text style={styles.backText}>NEXT (DEV)</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Verify Email</Text>
            <Text style={styles.subtitle}>
              Enter the code we sent to {email}
            </Text>

            <TextInput
              placeholder="6-digit code"
              placeholderTextColor="#666"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoCapitalize="none"
              style={styles.input}
            />

            <Pressable
              style={styles.button}
              onPress={handleVerifyCode}
              disabled={submitting}
            >
              <Text style={styles.buttonText}>
                {submitting ? "Verifying..." : "Verify"}
              </Text>
            </Pressable>

            <Pressable onPress={handleResendCode} style={styles.backButton}>
              <Text style={styles.backText}>Resend code</Text>
            </Pressable>

            <Pressable
              onPress={() => setStage("signup")}
              style={styles.backButton}
            >
              <Text style={styles.backText}>← Back to sign up</Text>
            </Pressable>
          </>
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 45,
    fontWeight: "bold",
    color: "#4d4139",
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 14,
    color: "#4d4139",
    marginBottom: 20,
    textAlign: "center",
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 12,
    backgroundColor: "white",
  },

  button: {
    width: "100%",
    padding: 14,
    backgroundColor: "black",
    borderRadius: 12,
    marginTop: 10,
    alignItems: "center",
  },

  buttonText: {
    color: "white",
    fontWeight: "600",
  },

  backButton: {
    marginTop: 20,
  },

  backText: {
    color: "#4d4139",
    fontSize: 14,
  },
});
