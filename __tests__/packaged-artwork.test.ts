export {}
const { retiredArtwork } = require('../scripts/launch/verify-packaged-artwork.cjs')
test('retired artwork is rejected without rejecting retained art or community bundles', () => {
    const retired = ['/public/assets/teams/old/players/face.webp', '\\public\\assets\\teams\\old\\logo.original.webp', '/public/assets/Steamworks Bilder/old.jpg', '/public/assets/portraits/mockup.webp', '/public/Live match.jpg', '/public/assets/Thecore']
    expect(retiredArtwork(retired)).toHaveLength(retired.length)
    expect(retiredArtwork(['/public/assets/teams/old/logo.png', '/public/assets/teams/old/logo.webp', '/public/assets/teams/old/logo.jpg'])).toHaveLength(3)
    expect(retiredArtwork(['/public/assets/teams/old/logo.png.webp', '/public/assets/teams/old/logo.backup.png'])).toHaveLength(2)
    expect(retiredArtwork(['/public/branding/portraits/portrait-new.png', '/public/assets/teams/club/logo.redesign.svg', '/community/players/face.png', '/public/maps/mirage.png'])).toEqual([])
    // Valve radar overviews and real-event tournament marks stay out of the package (build.files).
    const thirdParty = ['/public/maps/de_mirage_radar_psd.png', '\\public\\maps\\de_nuke_lower_radar_psd_2.png', '/public/assets/tournaments/logo_cct.webp', '/public/assets/tournaments/logo_perfect_world.webp', '/public/assets/tournaments/logo_copenhagen_major.webp', '/public/assets/tournaments/logo_shanghai_major.webp']
    expect(retiredArtwork(thirdParty)).toHaveLength(thirdParty.length)
    expect(retiredArtwork(['/public/radar-art/Mirage-upper.webp', '/public/assets/tournaments/logo_northern_major_2025.webp', '/public/key-art/title-stage.webp', '/public/trophy-art/major.webp'])).toEqual([])
})
