import {
  ImageBackground,
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Image,
  Pressable,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getRankedArtists } from "@/lib/matchApi";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

type ArtistProfile = {
  id: string;
  username: string;
  profile_pic: string;
  answers: Record<string, string>;
  compatibility?: number; // 0–100, provided by the matching backend
};

export default function GalleryDashboardScreen() {
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [galleryId, setGalleryId] = useState<string | null>(null);

  const position = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    loadArtists();
  }, []);

  const loadArtists = async () => {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      return;
    }

    const userId = session.user.id;
    setGalleryId(userId);

    // Get every artist this gallery has already swiped on
    const { data: swiped, error: swipedError } = await supabase
      .from("swipes")
      .select("artist_id")
      .eq("gallery_id", userId);

    if (swipedError) {
      console.error("Error fetching swipe history:", swipedError);
      setLoading(false);
      return;
    }

    const swipedIds = new Set((swiped ?? []).map((s) => s.artist_id));

    // Try the matching backend for ranked + scored results
    try {
      const ranked = await getRankedArtists(userId);
      const filtered = ranked
        .filter((r) => !swipedIds.has(r.artist_id))
        .map((r) => ({
          id: r.artist_id,
          username: r.username,
          profile_pic: r.profile_pic,
          answers: r.answers,
          compatibility: r.compatibility,
        }));
      setArtists(filtered);
      setCurrentIndex(0);
      setLoading(false);
      return;
    } catch (err) {
      console.log("Matching backend unavailable, falling back to Supabase:", err);
    }

    // Fallback: direct Supabase query without compatibility scores
    let query = supabase
      .from("profiles")
      .select("id, username, profile_pic, answers")
      .eq("user_type", "artist")
      .neq("id", userId);

    if (swipedIds.size > 0) {
      query = query.not("id", "in", `(${[...swipedIds].join(",")})`);
    }

    const { data: artistData, error: artistError } = await query;

    if (artistError) {
      console.error("Error fetching artists:", artistError);
      setLoading(false);
      return;
    }

    setArtists(artistData ?? []);
    setCurrentIndex(0);
    setLoading(false);
  };

  const recordSwipe = async (
    artist: ArtistProfile,
    decision: "liked" | "passed",
  ) => {
    if (!galleryId) return;

    console.log(galleryId, artist.id);

    const { error } = await supabase.from("swipes").insert([
      {
        gallery_id: galleryId,
        artist_id: artist.id,
        decision,
      },
    ]);

    if (error) {
      console.error("Error recording swipe:", error);
      return;
    }

    if (decision === "liked") {
      // 🔑 placeholder for real messaging logic later
      console.log(`Message sent to artist: ${artist.username} (${artist.id})`);
    } else {
      console.log(`Passed on artist: ${artist.username} (${artist.id})`);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe("liked");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe("passed");
        } else {
          resetPosition();
        }
      },
    }),
  ).current;

  const forceSwipe = (decision: "liked" | "passed") => {
    const x = decision === "liked" ? SCREEN_WIDTH + 100 : -SCREEN_WIDTH - 100;

    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => onSwipeComplete(decision));
  };

  const onSwipeComplete = (decision: "liked" | "passed") => {
    const artist = artists[currentIndex];
    if (artist) {
      recordSwipe(artist, decision);
    }

    position.setValue({ x: 0, y: 0 });
    setCurrentIndex((prev) => prev + 1);
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      outputRange: ["-10deg", "0deg", "10deg"],
    });

    return {
      ...position.getLayout(),
      transform: [{ rotate }],
    };
  };

  const renderCards = () => {
    if (loading) {
      return <Text style={styles.infoText}>Loading artists...</Text>;
    }

    if (currentIndex >= artists.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.infoText}>
            No more artists to review right now.
          </Text>
          <Pressable style={styles.refreshButton} onPress={loadArtists}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </Pressable>
        </View>
      );
    }

    return artists
      .map((artist, index) => {
        if (index < currentIndex) return null;

        if (index === currentIndex) {
          return (
            <Animated.View
              key={artist.id}
              style={[styles.card, getCardStyle()]}
              {...panResponder.panHandlers}
            >
              <ArtistCard artist={artist} />
            </Animated.View>
          );
        }

        // render the next card underneath, slightly smaller, for stack effect
        return (
          <View key={artist.id} style={[styles.card, styles.cardBehind]}>
            <ArtistCard artist={artist} />
          </View>
        );
      })
      .reverse();
  };

  return (
    <ImageBackground
      source={require("@/assets/images/background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <Text style={styles.title}>Discover Artists</Text>

        <View style={styles.cardStack}>{renderCards()}</View>

        {currentIndex < artists.length && !loading && (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.passButton]}
              onPress={() => forceSwipe("passed")}
            >
              <Text style={styles.actionButtonText}>✕</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.likeButton]}
              onPress={() => forceSwipe("liked")}
            >
              <Text style={styles.actionButtonText}>♥</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ImageBackground>
  );
}

function ArtistCard({ artist }: { artist: ArtistProfile }) {
  return (
    <>
      <View style={{ position: "relative" }}>
        <Image
          source={{ uri: artist.profile_pic }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        {artist.compatibility !== undefined && (
          <View style={styles.compatBadge}>
            <Text style={styles.compatText}>
              {Math.round(artist.compatibility)}% match
            </Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{artist.username}</Text>
        {artist.answers?.art_type && (
          <Text style={styles.cardDetail}>
            Art type: {artist.answers.art_type}
          </Text>
        )}
        {artist.answers?.years_experience && (
          <Text style={styles.cardDetail}>
            Experience: {artist.answers.years_experience} years
          </Text>
        )}
      </View>
    </>
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
    paddingTop: 80,
  },

  title: {
    fontFamily: "Euphoria",
    fontSize: 40,
    fontWeight: "bold",
    color: "#4d4139",
    marginBottom: 20,
  },

  cardStack: {
    width: SCREEN_WIDTH * 0.85,
    height: 450,
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: 20,
    backgroundColor: "white",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  cardBehind: {
    top: 10,
    transform: [{ scale: 0.96 }],
  },

  cardImage: {
    width: "100%",
    height: "70%",
  },

  cardInfo: {
    padding: 16,
  },

  cardName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#4d4139",
    marginBottom: 6,
  },

  cardDetail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },

  actionRow: {
    flexDirection: "row",
    gap: 40,
    marginTop: 30,
  },

  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  passButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#e74c3c",
  },

  likeButton: {
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#2ecc71",
  },

  actionButtonText: {
    fontSize: 28,
    fontWeight: "700",
  },

  infoText: {
    fontSize: 16,
    color: "#4d4139",
    textAlign: "center",
  },

  emptyState: {
    alignItems: "center",
    gap: 16,
  },

  refreshButton: {
    backgroundColor: "black",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },

  refreshButtonText: {
    color: "white",
    fontWeight: "600",
  },

  compatBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#3a332c",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  compatText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
});
