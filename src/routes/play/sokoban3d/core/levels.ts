// Classic Sokoban levels in compact string format
// # = wall, $ = box, . = target, @ = player, * = box on target, + = player on target, space = floor

export const LEVEL_DATA = [
  {
    id: 'level1',
    title: 'Tutorial',
    data: `
  ####
  #  #
  #$ #
  # .#
  #@ #
  ####`
  },
  {
    id: 'level2',
    title: 'Two Boxes',
    data: `
  #####
  #   #
  #$  #
  # $ #
  # ..#
  # @ #
  #####`
  },
  {
    id: 'level3',
    title: 'Corner Push',
    data: `
 ######
 #    #
 # $$ #
 # .. #
 #  @ #
 ######`
  },
  {
    id: 'level4',
    title: 'Tight Squeeze',
    data: `
  #######
  #     #
  # $$$ #
  #  .  #
  # .#. #
  #  @  #
  #######`
  },
  {
    id: 'level5',
    title: 'Advanced',
    data: `
########
#      #
# $$$$ #
# .  . #
# .  . #
#   @  #
########`
  }
];
