import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Automatically sign out any existing user whenever this screen opens
  useEffect(() => {
    const logout = async () => {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.log("Sign out error:", error.message);
      } else {
        console.log("Previous session cleared.");
      }
    };

    logout();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      Alert.alert(
        "Login Failed",
        "No account found with that email and password.",
      );
      return;
    }

    if (!data.user || !data.session) {
      setLoading(false);
      Alert.alert("Login Failed", "Unable to sign in. Please try again.");
      return;
    }

    // Fetch user_type from profiles to route correctly
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", data.user.id)
      .single();

    setLoading(false);

    if (!profile) {
      // Account exists but profile setup not finished
      router.replace("/new_user");
      return;
    }

    if (profile.user_type === "gallery") {
      router.replace("/gallery_dashboard");
    } else {
      router.replace("/artist_dashboard");
    }
  };
  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert("Enter your email first");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "myapp://reset-password",
    });

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Check your email", "We sent you a password reset link.");
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(255,255,255,0.4)",
        }}
      />

      <View style={styles.container}>
        <Text
          style={{
            fontFamily: "Euphoria",
            fontSize: 90,
            fontWeight: "bold",
            color: "#4d4139",
            marginBottom: 20,
          }}
        >
          Welcome
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

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={[styles.button, { backgroundColor: "#977d6d", opacity: loading ? 0.6 : 1 }]}
        >
          <Text style={[styles.buttonText, { color: "white" }]}>
            {loading ? "Signing in…" : "Login"}
          </Text>
        </Pressable>

        <Image
          source={require("@/assets/images/seperator.png")}
          style={{ width: 300, height: 25, marginVertical: 10 }}
        />

        <Pressable
          onPress={() => router.push("/signup")}
          style={[styles.button, { backgroundColor: "#977d6d" }]}
        >
          <Text style={[styles.buttonText, { color: "white" }]}>
            New User? Sign Up!
          </Text>
        </Pressable>

        <Pressable
          onPress={handleResetPassword}
          style={{
            marginTop: 10,
            padding: 12,
            backgroundColor: "black",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            {loading ? "Sending..." : "Forgot Password"}
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: "white",
  },

  button: {
    padding: 12,
    backgroundColor: "black",
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    borderRadius: 10,
  },

  buttonText: {
    color: "white",
    fontWeight: "bold",
  },
});
